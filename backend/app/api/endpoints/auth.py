from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.api import deps
from app.db.base import get_db
from app.models.user import User
from app.schemas.user import UserResponse, AuthRegister, AuthVerify, AuthLogin
from app.core.security import create_access_token
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta, datetime
import secrets

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

router = APIRouter()

def generate_otp() -> str:
    """Generate a 6-digit random OTP."""
    return str(secrets.randbelow(900000) + 100000)

@router.post("/register")
async def register(data: AuthRegister, db: AsyncSession = Depends(get_db)):
    """Register or refresh OTP for an existing user."""
    result = await db.execute(
        select(User).filter(
            or_(User.phone_number == data.identifier, User.username == data.identifier)
        )
    )
    user = result.scalars().first()

    otp_code = generate_otp()
    otp_expires = datetime.utcnow() + timedelta(minutes=10)

    if user:
        # User already exists — refresh OTP so they can log in again
        user.otp_code = otp_code
        user.otp_expires_at = otp_expires
        db.add(user)
        await db.commit()
    else:
        # Create new unverified user with OTP
        user = User(
            username=data.identifier if not data.identifier.replace('+', '').replace('-', '').isdigit() else None,
            phone_number=data.identifier if data.identifier.replace('+', '').replace('-', '').isdigit() else None,
            display_name=data.display_name or data.identifier,
            is_verified=False,
            is_online=False,
            otp_code=otp_code,
            otp_expires_at=otp_expires,
        )
        db.add(user)
        await db.commit()

    # In production: send otp_code via SMS/email here.
    # For demo: return it directly in the response.
    return {
        "message": "OTP generated. Please verify.",
        "identifier": data.identifier,
        "demo_otp": otp_code  # Remove this line in production with real SMS
    }

@router.post("/verify")
async def verify(data: AuthVerify, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).filter(
            or_(User.phone_number == data.identifier, User.username == data.identifier)
        )
    )
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=400, detail="User not found. Please register first.")

    if not user.otp_code or user.otp_code != data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    if not user.otp_expires_at or datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    # Mark user as verified and clear OTP fields
    user.is_verified = True
    user.is_online = True
    user.otp_code = None
    user.otp_expires_at = None
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Return Bearer token — no cookie needed
    access_token = create_access_token(subject=user.id)
    return {"access_token": access_token, "token_type": "bearer", "user_id": user.id}

@router.post("/login")
async def login(data: AuthLogin, db: AsyncSession = Depends(get_db)):
    """Direct login for users who already have an account (bypasses OTP for dev)."""
    result = await db.execute(
        select(User).filter(
            or_(User.phone_number == data.identifier, User.username == data.identifier)
        )
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = create_access_token(subject=user.id)
    return {"access_token": access_token, "token_type": "bearer", "user_id": user.id}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(deps.get_current_user)):
    return current_user

@router.post("/logout")
async def logout():
    # Token is stored client-side; client must delete it. Nothing to do server-side.
    return {"message": "Successfully logged out"}

@router.patch("/me", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if data.display_name is not None:
        current_user.display_name = data.display_name
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user

