import asyncio
from app.db.base import engine, Base
from app.models import *

async def go():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created/updated successfully")

asyncio.run(go())
