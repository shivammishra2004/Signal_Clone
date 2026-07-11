from fastapi import WebSocket
from typing import Dict, List, Optional
import json
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.base import AsyncSessionLocal
from app.models.user import User
from app.models.contact import Contact
from app.models.conversation import ConversationParticipant

class ConnectionManager:
    def __init__(self):
        # user_id -> list of active websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        is_new_user = False
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
            is_new_user = True
            
        self.active_connections[user_id].append(websocket)
        
        if is_new_user:
            # User just came online
            await self._update_presence(user_id, is_online=True)
            await self._mark_pending_messages_delivered(user_id)

    async def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                # User went offline
                await self._update_presence(user_id, is_online=False)

    async def _update_presence(self, user_id: str, is_online: bool):
        now = datetime.utcnow()
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).filter(User.id == user_id))
            user = result.scalars().first()
            if user:
                user.is_online = is_online
                if not is_online:
                    user.last_seen_at = now
                db.add(user)
                await db.commit()
                
            # Find all users who share a conversation with this user
            result = await db.execute(
                select(ConversationParticipant.user_id)
                .filter(ConversationParticipant.conversation_id.in_(
                    select(ConversationParticipant.conversation_id)
                    .filter(ConversationParticipant.user_id == user_id)
                ))
            )
            shared_users = set(result.scalars().all())
            
            # Send presence update event
            event = {
                "type": "presence.update",
                "payload": {
                    "user_id": user_id,
                    "is_online": is_online,
                    "last_seen_at": now.isoformat() if not is_online else None
                }
            }
            
            for su_id in shared_users:
                if su_id != user_id:
                    await self.send_to_user(su_id, event)

    async def _mark_pending_messages_delivered(self, user_id: str):
        from app.models.message import Message
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(ConversationParticipant).filter(ConversationParticipant.user_id == user_id))
            participants = res.scalars().all()
            
            for p in participants:
                msg_res = await db.execute(
                    select(Message.id)
                    .filter(Message.conversation_id == p.conversation_id)
                    .filter(Message.sender_id != user_id)
                    .order_by(Message.id.desc())
                    .limit(1)
                )
                latest_msg_id = msg_res.scalar()
                if latest_msg_id:
                    if not p.last_delivered_message_id or latest_msg_id > p.last_delivered_message_id:
                        p.last_delivered_message_id = latest_msg_id
                        db.add(p)
                        event = {
                            "type": "message.delivered",
                            "payload": {
                                "message_id": latest_msg_id,
                                "user_id": user_id,
                                "conversation_id": p.conversation_id
                            }
                        }
                        await self.send_to_conversation(p.conversation_id, event, exclude_user_id=user_id)
            await db.commit()

    async def send_to_user(self, user_id: str, event: dict):
        if user_id in self.active_connections:
            msg = json.dumps(event)
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(msg)
                except Exception:
                    pass

    async def send_to_conversation(self, conversation_id: str, event: dict, exclude_user_id: Optional[str] = None):
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ConversationParticipant)
                .filter(ConversationParticipant.conversation_id == conversation_id)
            )
            participants = result.scalars().all()
            
        for p in participants:
            if p.user_id != exclude_user_id:
                await self.send_to_user(p.user_id, event)

manager = ConnectionManager()
