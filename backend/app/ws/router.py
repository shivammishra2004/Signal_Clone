import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from app.core.security import verify_token
from app.db.base import AsyncSessionLocal
from app.models.user import User
from app.models.message import Message
from app.models.conversation import ConversationParticipant
from app.ws.manager import manager

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    # Authenticate
    # Check query param first, then cookie
    if not token:
        token = websocket.cookies.get("access_token")
    
    if not token:
        await websocket.close(code=1008)
        return
        
    user_id = verify_token(token)
    if not user_id:
        await websocket.close(code=1008)
        return
        
    # Verify user exists
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).filter(User.id == user_id))
        if not res.scalars().first():
            await websocket.close(code=1008)
            return

    await manager.connect(user_id, websocket)
    
    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
                event_type = data.get("type")
                payload = data.get("payload", {})
                
                if event_type == "message.ack":
                    message_id = payload.get("message_id")
                    if message_id:
                        async with AsyncSessionLocal() as db:
                            # Update last_delivered_message_id
                            msg_res = await db.execute(select(Message).filter(Message.id == message_id))
                            msg = msg_res.scalars().first()
                            if msg:
                                part_res = await db.execute(
                                    select(ConversationParticipant)
                                    .filter(ConversationParticipant.conversation_id == msg.conversation_id)
                                    .filter(ConversationParticipant.user_id == user_id)
                                )
                                participant = part_res.scalars().first()
                                if participant:
                                    participant.last_delivered_message_id = message_id
                                    db.add(participant)
                                    await db.commit()
                                    
                                    # Push message.delivered to sender
                                    event = {
                                        "type": "message.delivered",
                                        "payload": {
                                            "message_id": message_id,
                                            "user_id": user_id
                                        }
                                    }
                                    await manager.send_to_user(msg.sender_id, event)

                elif event_type in ["typing.start", "typing.stop"]:
                    conversation_id = payload.get("conversation_id")
                    if conversation_id:
                        event = {
                            "type": "typing.update",
                            "payload": {
                                "conversation_id": conversation_id,
                                "user_id": user_id,
                                "is_typing": event_type == "typing.start"
                            }
                        }
                        await manager.send_to_conversation(conversation_id, event, exclude_user_id=user_id)
                        
            except json.JSONDecodeError:
                pass
            except Exception as e:
                print(f"WS error processing event: {e}")
                
    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
