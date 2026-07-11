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
                
            # Broadcast to contacts (and maybe groups, but contacts is simpler and usually correct)
            # Find all users who have this user as a contact
            result = await db.execute(select(Contact).filter(Contact.contact_user_id == user_id))
            contacts = result.scalars().all()
            
            # Send presence update event
            event = {
                "type": "presence.update",
                "payload": {
                    "user_id": user_id,
                    "is_online": is_online,
                    "last_seen_at": now.isoformat() if not is_online else None
                }
            }
            
            for c in contacts:
                await self.send_to_user(c.owner_id, event)

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
