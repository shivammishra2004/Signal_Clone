import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship
from app.db.base import Base

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True) # Usually monotonically increasing like snowflake, but we'll use a string for now, or maybe auto-increment integer? The prompt says "monotonically increasing / orderable". Let's use a combination of timestamp and uuid or auto-increment integer? Actually, SQLite auto-increment is easy.
    # Let's use string, but we can generate them orderable (like KSUID or ULID). For simplicity, we'll use a custom generator or string with timestamp prefix.
    # Wait, "monotonically increasing / orderable" might just mean we can order by it. Or we can just use Integer.
    # Let's use String, and generate it sequentially or use Integer. I will use String and generate it based on timestamp.
    # Actually, SQLite `INTEGER PRIMARY KEY` is monotonically increasing.
    # But wait, earlier FKs in ConversationParticipant used String.
    # I'll stick to String and use a timestamp-based ID in Python to make it orderable.
    
    conversation_id = Column(String, ForeignKey("conversations.id"), index=True, nullable=False)
    sender_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    content = Column(String, nullable=True)
    reply_to_id = Column(String, ForeignKey("messages.id"), nullable=True)
    file_url = Column(String, nullable=True)
    file_type = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    conversation = relationship("Conversation")
