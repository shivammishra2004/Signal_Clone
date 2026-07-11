from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.user import UserResponse

class ContactBase(BaseModel):
    contact_user_id: str

class ContactCreate(ContactBase):
    pass

class ContactResponse(BaseModel):
    id: str
    owner_id: str
    contact_user: UserResponse
    created_at: datetime

    class Config:
        from_attributes = True
