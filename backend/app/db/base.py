from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

from sqlalchemy import event
from sqlalchemy.engine import Engine

db_url = settings.DATABASE_URL
if db_url.startswith("postgres://") or db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    # Strip query parameters that cause asyncpg errors (e.g. sslmode, channel_binding)
    import urllib.parse
    parsed = urllib.parse.urlparse(db_url)
    db_url = urllib.parse.urlunparse(parsed._replace(query="ssl=require"))

engine = create_async_engine(db_url, echo=False)

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if settings.DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
