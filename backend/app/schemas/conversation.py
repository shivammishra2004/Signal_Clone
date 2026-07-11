from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.user import UserResponse

class ConversationParticipantResponse(BaseModel):
    user_id: str
    role: str
    joined_at: datetime
    last_read_message_id: Optional[str] = None
    last_delivered_message_id: Optional[str] = None
    user: UserResponse

    class Config:
        from_attributes = True

class ConversationResponse(BaseModel):
    id: str
    type: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_by: str
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None
    created_at: datetime
    unread_count: int = 0
    participants: List[ConversationParticipantResponse] = []

    class Config:
        from_attributes = True

class GroupCreate(BaseModel):
    name: str
    participant_ids: List[str]
    avatar_url: Optional[str] = None

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    add_participant_ids: Optional[List[str]] = None
    remove_participant_ids: Optional[List[str]] = None

class ConversationCreate(BaseModel):
    type: str
    name: Optional[str] = None
    participant_ids: List[str]
