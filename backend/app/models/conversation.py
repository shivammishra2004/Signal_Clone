import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=generate_uuid)
    type = Column(String, nullable=False) # 'direct' or 'group'
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    last_message_at = Column(DateTime, nullable=True)
    last_message_preview = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    participants = relationship("ConversationParticipant", back_populates="conversation")

class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"
    __table_args__ = (
        UniqueConstraint('conversation_id', 'user_id', name='uq_conversation_participant'),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    conversation_id = Column(String, ForeignKey("conversations.id"), index=True, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    role = Column(String, default="member") # 'member' or 'admin'
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_read_message_id = Column(String, ForeignKey("messages.id"), nullable=True)
    last_delivered_message_id = Column(String, ForeignKey("messages.id"), nullable=True)

    conversation = relationship("Conversation", back_populates="participants")
    user = relationship("User")
