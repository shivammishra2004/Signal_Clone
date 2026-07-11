from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    phone_number: Optional[str] = None
    username: Optional[str] = None
    display_name: str
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: str
    is_verified: bool
    is_online: bool
    last_seen_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AuthRegister(BaseModel):
    identifier: str # phone or username
    display_name: str
    avatar_url: Optional[str] = None

class AuthVerify(BaseModel):
    identifier: str
    otp: str

class AuthLogin(BaseModel):
    identifier: str
