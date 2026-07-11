from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from app.schemas.message import MessageResponse

class WSEvent(BaseModel):
    type: str
    payload: Any

class TypingUpdateEvent(BaseModel):
    conversation_id: str
    user_id: str
    is_typing: bool

class MessageDeliveredEvent(BaseModel):
    message_id: str
    user_id: str

class MessageReadEvent(BaseModel):
    conversation_id: str
    up_to_message_id: str
    user_id: str

class PresenceUpdateEvent(BaseModel):
    user_id: str
    is_online: bool
    last_seen_at: Optional[datetime] = None

class ConversationUpdatedEvent(BaseModel):
    conversation_id: str
    
# Client to server models (used for validation if needed)
class ClientAckEvent(BaseModel):
    message_id: str

class ClientTypingEvent(BaseModel):
    conversation_id: str
