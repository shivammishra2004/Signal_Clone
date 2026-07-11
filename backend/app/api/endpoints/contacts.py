from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.api import deps
from app.db.base import get_db
from app.models.contact import Contact
from app.models.user import User
from app.schemas.contact import ContactResponse
from app.schemas.user import UserResponse
from sqlalchemy import or_

router = APIRouter()

@router.get("/", response_model=List[ContactResponse])
async def read_contacts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    result = await db.execute(
        select(Contact)
        .options(selectinload(Contact.contact_user)) # We need relationship for this to work
        .filter(Contact.owner_id == current_user.id)
    )
    contacts = result.scalars().all()
    return contacts

@router.get("/search", response_model=List[UserResponse])
async def search_users(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    result = await db.execute(
        select(User).filter(
            or_(
                User.username.ilike(f"%{q}%"),
                User.phone_number.ilike(f"%{q}%"),
                User.display_name.ilike(f"%{q}%")
            )
        )
    )
    return result.scalars().all()
