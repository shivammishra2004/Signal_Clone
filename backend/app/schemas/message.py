from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime

class ReactionSummary(BaseModel):
    emoji: str
    count: int
    user_ids: List[str]

class MessageBase(BaseModel):
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None

class MessageCreate(MessageBase):
    reply_to_id: Optional[str] = None

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    created_at: datetime
    reply_to_id: Optional[str] = None
    reply_to_preview: Optional[str] = None
    reactions: List[ReactionSummary] = []

    class Config:
        from_attributes = True

class ReadReceiptRequest(BaseModel):
    message_id: str
