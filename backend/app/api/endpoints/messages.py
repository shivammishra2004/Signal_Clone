import uuid
from datetime import datetime
import os
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, delete, update
from typing import List, Optional
from app.api import deps
from app.db.base import get_db
from app.core.config import settings
from app.models.message import Message
from app.models.reaction import MessageReaction
from app.models.conversation import Conversation, ConversationParticipant
from app.models.user import User
from app.schemas.message import MessageResponse, MessageCreate, ReadReceiptRequest, ReactionSummary
from app.ws.manager import manager

router = APIRouter()

def generate_message_id():
    return f"{int(datetime.utcnow().timestamp()*1000)}_{uuid.uuid4()}"

async def build_message_response(
    msg: Message,
    db: AsyncSession,
    current_user_id: Optional[str] = None,
    other_participants: Optional[List[ConversationParticipant]] = None
) -> dict:
    """Build full message dict including reactions, reply preview, and read status."""
    # Fetch reactions grouped by emoji
    r_res = await db.execute(
        select(MessageReaction).filter(MessageReaction.message_id == msg.id)
    )
    raw_reactions = r_res.scalars().all()

    reaction_map: dict = {}
    for r in raw_reactions:
        if r.emoji not in reaction_map:
            reaction_map[r.emoji] = {"emoji": r.emoji, "count": 0, "user_ids": []}
        reaction_map[r.emoji]["count"] += 1
        reaction_map[r.emoji]["user_ids"].append(r.user_id)

    # Fetch reply preview if applicable
    reply_preview = None
    if msg.reply_to_id:
        rp_res = await db.execute(select(Message).filter(Message.id == msg.reply_to_id))
        rp_msg = rp_res.scalars().first()
        if rp_msg:
            reply_preview = rp_msg.content[:80]

    result = {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "content": msg.content,
        "created_at": msg.created_at.isoformat(),
        "reply_to_id": msg.reply_to_id,
        "reply_to_preview": reply_preview,
        "reactions": list(reaction_map.values()),
    }

    # Compute status only for sender's own messages
    if current_user_id and msg.sender_id == current_user_id and other_participants is not None:
        if len(other_participants) == 0:
            result["status"] = "sent"
        else:
            read_by_all = all(
                p.last_read_message_id and p.last_read_message_id >= msg.id
                for p in other_participants
            )
            delivered_to_all = all(
                p.last_delivered_message_id and p.last_delivered_message_id >= msg.id
                for p in other_participants
            )
            if read_by_all:
                result["status"] = "read"
            elif delivered_to_all:
                result["status"] = "delivered"
            else:
                result["status"] = "sent"

    return result


@router.get("/{conversation_id}/messages")
async def read_messages(
    conversation_id: str,
    cursor: Optional[str] = None,
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    res = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation_id)
    )
    all_participants = res.scalars().all()
    if not any(p.user_id == current_user.id for p in all_participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    other_participants = [p for p in all_participants if p.user_id != current_user.id]

    query = select(Message).filter(Message.conversation_id == conversation_id)
    if cursor:
        query = query.filter(Message.id < cursor)
    query = query.order_by(Message.id.asc()).limit(limit)

    result = await db.execute(query)
    messages = result.scalars().all()

    return [await build_message_response(m, db, current_user.id, other_participants) for m in messages]


@router.post("/{conversation_id}/messages")
async def create_message(
    conversation_id: str,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    res = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation_id)
    )
    all_participants = res.scalars().all()
    if not any(p.user_id == current_user.id for p in all_participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    msg = Message(
        id=generate_message_id(),
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=data.content,
        reply_to_id=data.reply_to_id
    )
    db.add(msg)

    conv_res = await db.execute(select(Conversation).filter(Conversation.id == conversation_id))
    conv = conv_res.scalars().first()
    if conv:
        conv.last_message_at = msg.created_at
        conv.last_message_preview = msg.content[:80]
        db.add(conv)

    await db.commit()
    await db.refresh(msg)

    other_participants = [p for p in all_participants if p.user_id != current_user.id]
    payload = await build_message_response(msg, db, current_user.id, other_participants)
    await manager.send_to_conversation(conversation_id, {"type": "message.new", "payload": payload}, exclude_user_id=current_user.id)

    return payload


@router.post("/{conversation_id}/upload")
async def upload_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Upload an attachment and return its local URL."""
    # Verify participant
    res = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation_id)
        .filter(ConversationParticipant.user_id == current_user.id)
    )
    if not res.scalars().first():
        raise HTTPException(status_code=403, detail="Not a participant")

    # Ensure uploads directory exists
    os.makedirs("uploads", exist_ok=True)

    # Save file
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join("uploads", unique_filename)

    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)

    # Return URL
    file_url = f"{settings.API_BASE_URL}/uploads/{unique_filename}"
    return {"file_url": file_url, "file_type": file.content_type}


@router.post("/{conversation_id}/messages/{message_id}/react")
async def toggle_reaction(
    conversation_id: str,
    message_id: str,
    emoji: str = Query(..., min_length=1, max_length=8),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Toggle a reaction emoji. Adding the same emoji twice removes it."""
    # Verify participant
    res = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation_id)
        .filter(ConversationParticipant.user_id == current_user.id)
    )
    if not res.scalars().first():
        raise HTTPException(status_code=403, detail="Not a participant")

    # Check if reaction already exists
    exist_res = await db.execute(
        select(MessageReaction).filter(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == current_user.id,
            MessageReaction.emoji == emoji
        )
    )
    existing = exist_res.scalars().first()

    if existing:
        await db.delete(existing)
        action = "removed"
    else:
        db.add(MessageReaction(message_id=message_id, user_id=current_user.id, emoji=emoji))
        action = "added"

    await db.commit()

    # Broadcast updated reactions to whole conversation
    msg_res = await db.execute(select(Message).filter(Message.id == message_id))
    msg = msg_res.scalars().first()
    if msg:
        payload = await build_message_response(msg, db)
        await manager.send_to_conversation(
            conversation_id,
            {"type": "message.reaction", "payload": {"message_id": message_id, "reactions": payload["reactions"]}},
        )

    return {"action": action}


@router.delete("/{conversation_id}/messages/{message_id}")
async def delete_message(
    conversation_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # Verify participant
    res = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation_id)
        .filter(ConversationParticipant.user_id == current_user.id)
    )
    if not res.scalars().first():
        raise HTTPException(status_code=403, detail="Not a participant")

    msg_res = await db.execute(select(Message).filter(Message.id == message_id))
    msg = msg_res.scalars().first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # 1. Delete associated reactions to avoid foreign key violation
    await db.execute(delete(MessageReaction).where(MessageReaction.message_id == message_id))

    # 2. Nullify reply_to_id on child messages to avoid foreign key violation
    await db.execute(
        update(Message)
        .where(Message.reply_to_id == message_id)
        .values(reply_to_id=None)
    )

    # 3. Nullify read/delivered receipt pointers in participants
    await db.execute(
        update(ConversationParticipant)
        .where(ConversationParticipant.last_read_message_id == message_id)
        .values(last_read_message_id=None)
    )
    await db.execute(
        update(ConversationParticipant)
        .where(ConversationParticipant.last_delivered_message_id == message_id)
        .values(last_delivered_message_id=None)
    )

    await db.delete(msg)
    await db.commit()

    # Broadcast deletion
    await manager.send_to_conversation(
        conversation_id,
        {"type": "message.deleted", "payload": {"message_id": message_id}},
    )
    return {"status": "deleted"}


@router.post("/{conversation_id}/read")
async def mark_read(
    conversation_id: str,
    data: ReadReceiptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    res = await db.execute(
        select(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation_id)
        .filter(ConversationParticipant.user_id == current_user.id)
    )
    participant = res.scalars().first()
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")

    participant.last_read_message_id = data.message_id
    participant.last_delivered_message_id = data.message_id
    db.add(participant)
    await db.commit()

    event = {
        "type": "message.read",
        "payload": {"conversation_id": conversation_id, "up_to_message_id": data.message_id, "user_id": current_user.id}
    }
    await manager.send_to_conversation(conversation_id, event, exclude_user_id=current_user.id)
    return {"status": "success"}
