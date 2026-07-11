from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.api import deps
from app.db.base import get_db
from app.models.conversation import Conversation, ConversationParticipant
from app.models.user import User
from app.schemas.conversation import ConversationResponse, ConversationCreate, GroupCreate, GroupUpdate
from app.ws.manager import manager

router = APIRouter()

@router.get("/", response_model=List[ConversationResponse])
async def read_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # Get all conversations the user is a part of
    result = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.user_id == current_user.id)
    )
    participant_rows = result.scalars().all()
    conversation_ids = [p.conversation_id for p in participant_rows]

    # Fetch conversations with participants sorted by last_message_at DESC
    result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.participants).selectinload(ConversationParticipant.user)
        )
        .filter(Conversation.id.in_(conversation_ids))
        .order_by(desc(Conversation.last_message_at))
    )
    conversations = result.scalars().all()
    
    from app.models.message import Message
    from sqlalchemy import func
    
    # Calculate unread count for each conversation
    response_list = []
    for conv in conversations:
        # Find current user's participant record
        curr_p = next((p for p in conv.participants if p.user_id == current_user.id), None)
        unread_count = 0
        if curr_p:
            if curr_p.last_read_message_id:
                count_res = await db.execute(
                    select(func.count()).select_from(Message).filter(
                        Message.conversation_id == conv.id,
                        Message.id > curr_p.last_read_message_id,
                        Message.sender_id != current_user.id
                    )
                )
                unread_count = count_res.scalar() or 0
            else:
                # No read message id yet -> all messages not from self are unread
                count_res = await db.execute(
                    select(func.count()).select_from(Message).filter(
                        Message.conversation_id == conv.id,
                        Message.sender_id != current_user.id
                    )
                )
                unread_count = count_res.scalar() or 0
                
        # Manually construct response to inject unread_count
        resp_dict = ConversationResponse.model_validate(conv).model_dump()
        resp_dict["unread_count"] = unread_count
        response_list.append(resp_dict)

    return response_list

@router.get("/search", response_model=List[ConversationResponse])
async def search_conversations(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # This is a basic search implementation.
    # In a real app we'd search names, participant names, etc.
    result = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.user_id == current_user.id)
    )
    participant_rows = result.scalars().all()
    conversation_ids = [p.conversation_id for p in participant_rows]

    result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.participants).selectinload(ConversationParticipant.user)
        )
        .filter(Conversation.id.in_(conversation_ids))
        .filter(Conversation.name.ilike(f"%{q}%"))
        .order_by(desc(Conversation.last_message_at))
    )
    conversations = result.scalars().all()
    return conversations

@router.post("/", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if data.type == "direct":
        if len(data.participant_ids) != 1:
            raise HTTPException(status_code=400, detail="Direct conversation must have exactly one other participant")
        other_user_id = data.participant_ids[0]
        # Check if conversation already exists
        # In a real app, query for exact match of direct conversation between these two
    
    # Create conversation
    conv = Conversation(
        type=data.type,
        name=data.name,
        created_by=current_user.id
    )
    db.add(conv)
    await db.flush() # get conv.id
    
    # Add participants
    p_creator = ConversationParticipant(conversation_id=conv.id, user_id=current_user.id, role="admin")
    db.add(p_creator)
    
    for pid in data.participant_ids:
        # Check user exists
        res = await db.execute(select(User).filter(User.id == pid))
        if not res.scalars().first():
            raise HTTPException(status_code=404, detail=f"User {pid} not found")
        role = "member"
        if data.type == "direct": role = "admin" # usually direct users are both admins implicitly or members
        p = ConversationParticipant(conversation_id=conv.id, user_id=pid, role=role)
        db.add(p)

    await db.commit()
    await db.refresh(conv)
    
    # reload with relations
    res = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
        .filter(Conversation.id == conv.id)
    )
    return res.scalars().first()

@router.post("/group", response_model=ConversationResponse)
async def create_group(
    data: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if len(data.participant_ids) < 1:
        raise HTTPException(status_code=400, detail="Group must have at least one other participant")

    conv = Conversation(
        type="group",
        name=data.name,
        avatar_url=data.avatar_url,
        created_by=current_user.id
    )
    db.add(conv)
    await db.flush()

    # Creator is admin
    db.add(ConversationParticipant(conversation_id=conv.id, user_id=current_user.id, role="admin"))
    
    # Others are members
    for pid in data.participant_ids:
        # Check user exists
        res = await db.execute(select(User).filter(User.id == pid))
        if not res.scalars().first():
            raise HTTPException(status_code=404, detail=f"User {pid} not found")
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=pid, role="member"))

    await db.commit()
    await db.refresh(conv)

    res = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
        .filter(Conversation.id == conv.id)
    )
    full_conv = res.scalars().first()
    
    # Notify participants
    for p in full_conv.participants:
        await manager.send_to_user(p.user_id, {
            "type": "conversation.added",
            "payload": full_conv.id
        })
        
    return full_conv

@router.put("/{id}/group", response_model=ConversationResponse)
async def update_group(
    id: str,
    data: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # Verify group and admin status
    res = await db.execute(select(Conversation).filter(Conversation.id == id, Conversation.type == "group"))
    conv = res.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")

    p_res = await db.execute(select(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == id, 
        ConversationParticipant.user_id == current_user.id,
        ConversationParticipant.role == "admin"
    ))
    if not p_res.scalars().first():
        raise HTTPException(status_code=403, detail="Only admins can modify the group")

    # Update fields
    if data.name:
        conv.name = data.name
    if data.avatar_url is not None:
        conv.avatar_url = data.avatar_url

    # Add participants
    if data.add_participant_ids:
        for pid in data.add_participant_ids:
            res = await db.execute(select(User).filter(User.id == pid))
            if not res.scalars().first():
                raise HTTPException(status_code=404, detail=f"User {pid} not found")
            
            # Check if already in group
            exist = await db.execute(select(ConversationParticipant).filter(
                ConversationParticipant.conversation_id == id,
                ConversationParticipant.user_id == pid
            ))
            if not exist.scalars().first():
                db.add(ConversationParticipant(conversation_id=conv.id, user_id=pid, role="member"))

    # Remove participants
    if data.remove_participant_ids:
        for pid in data.remove_participant_ids:
            if pid == current_user.id:
                raise HTTPException(status_code=400, detail="Admins cannot remove themselves via this endpoint")
            del_res = await db.execute(select(ConversationParticipant).filter(
                ConversationParticipant.conversation_id == id,
                ConversationParticipant.user_id == pid
            ))
            to_del = del_res.scalars().first()
            if to_del:
                await db.delete(to_del)

    await db.commit()
    
    # Reload and return
    res = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
        .filter(Conversation.id == id)
    )
    full_conv = res.scalars().first()
    
    # Notify participants about group update
    for p in full_conv.participants:
        await manager.send_to_user(p.user_id, {
            "type": "conversation.updated",
            "payload": full_conv.id
        })
        
    return full_conv
