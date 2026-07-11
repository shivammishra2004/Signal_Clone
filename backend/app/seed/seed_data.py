import asyncio
import random
from datetime import datetime, timedelta
from sqlalchemy import select
from app.db.base import AsyncSessionLocal
from app.models.user import User
from app.models.contact import Contact
from app.models.conversation import Conversation, ConversationParticipant
from app.models.message import Message

async def generate_id():
    import uuid
    return str(uuid.uuid4())

async def seed():
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        result = await db.execute(select(User).limit(1))
        if result.scalars().first():
            print("Database already seeded.")
            return

        print("Starting seed...")

        # 1. Create Users
        users = [
            User(username="alice", phone_number="111", display_name="Alice", is_verified=True, is_online=True),
            User(username="bob", phone_number="222", display_name="Bob", is_verified=True, is_online=False, last_seen_at=datetime.utcnow() - timedelta(hours=1)),
            User(username="charlie", phone_number="333", display_name="Charlie", is_verified=True, is_online=True),
            User(username="diana", phone_number="444", display_name="Diana", is_verified=True, is_online=False, last_seen_at=datetime.utcnow() - timedelta(minutes=15)),
            User(username="eve", phone_number="555", display_name="Eve", is_verified=True, is_online=True),
            User(username="frank", phone_number="666", display_name="Frank", is_verified=True, is_online=False, last_seen_at=datetime.utcnow() - timedelta(days=1)),
            User(username="grace", phone_number="777", display_name="Grace", is_verified=True, is_online=True),
        ]
        db.add_all(users)
        await db.commit()
        for u in users:
            await db.refresh(u)

        # 2. Create Contacts (fully connected for simplicity)
        contacts = []
        for u1 in users:
            for u2 in users:
                if u1.id != u2.id:
                    contacts.append(Contact(owner_id=u1.id, contact_user_id=u2.id))
        db.add_all(contacts)
        await db.commit()

        # Helper to create messages
        async def create_messages(conv, participants, count=15):
            msgs = []
            base_time = datetime.utcnow() - timedelta(days=2)
            
            for i in range(count):
                sender = random.choice(participants).user_id
                time = base_time + timedelta(hours=i)
                # make ids orderable using timestamp
                msg_id = f"{int(time.timestamp()*1000)}_{await generate_id()}"
                
                msgs.append(Message(
                    id=msg_id,
                    conversation_id=conv.id,
                    sender_id=sender,
                    content=f"Message {i} in {conv.name or 'direct'}",
                    created_at=time
                ))
            
            db.add_all(msgs)
            await db.commit()
            for m in msgs:
                await db.refresh(m)
            
            # Update denormalized fields
            conv.last_message_at = msgs[-1].created_at
            conv.last_message_preview = msgs[-1].content
            db.add(conv)
            await db.commit()
            
            return msgs

        # 3. 1:1 Conversation: Fully Read
        conv_read = Conversation(type="direct", created_by=users[0].id)
        db.add(conv_read)
        await db.commit()
        await db.refresh(conv_read)
        
        p1 = ConversationParticipant(conversation_id=conv_read.id, user_id=users[0].id)
        p2 = ConversationParticipant(conversation_id=conv_read.id, user_id=users[1].id)
        db.add_all([p1, p2])
        await db.commit()
        
        msgs_read = await create_messages(conv_read, [p1, p2])
        last_msg = msgs_read[-1]
        
        p1.last_read_message_id = last_msg.id
        p1.last_delivered_message_id = last_msg.id
        p2.last_read_message_id = last_msg.id
        p2.last_delivered_message_id = last_msg.id
        db.add_all([p1, p2])
        await db.commit()

        # 4. 1:1 Conversation: Unread messages (p3 has read, p4 has delivered but unread)
        conv_unread = Conversation(type="direct", created_by=users[2].id)
        db.add(conv_unread)
        await db.commit()
        await db.refresh(conv_unread)
        
        p3 = ConversationParticipant(conversation_id=conv_unread.id, user_id=users[2].id)
        p4 = ConversationParticipant(conversation_id=conv_unread.id, user_id=users[3].id)
        db.add_all([p3, p4])
        await db.commit()
        
        msgs_unread = await create_messages(conv_unread, [p3, p4])
        
        # p3 sent last few, p4 hasn't read them
        p3.last_read_message_id = msgs_unread[-1].id
        p3.last_delivered_message_id = msgs_unread[-1].id
        
        # p4 read up to -5, delivered up to -1
        p4.last_read_message_id = msgs_unread[-5].id
        p4.last_delivered_message_id = msgs_unread[-1].id
        db.add_all([p3, p4])
        await db.commit()

        # 5. 1:1 Conversation: Undelivered (Offline)
        conv_offline = Conversation(type="direct", created_by=users[4].id)
        db.add(conv_offline)
        await db.commit()
        await db.refresh(conv_offline)
        
        p5 = ConversationParticipant(conversation_id=conv_offline.id, user_id=users[4].id)
        p6 = ConversationParticipant(conversation_id=conv_offline.id, user_id=users[5].id)
        db.add_all([p5, p6])
        await db.commit()
        
        msgs_offline = await create_messages(conv_offline, [p5, p6])
        
        # p5 is fully caught up
        p5.last_read_message_id = msgs_offline[-1].id
        p5.last_delivered_message_id = msgs_offline[-1].id
        
        # p6 offline: read up to -5, delivered only up to -5 (hasn't received last 4 messages)
        p6.last_read_message_id = msgs_offline[-5].id
        p6.last_delivered_message_id = msgs_offline[-5].id
        db.add_all([p5, p6])
        await db.commit()

        # 6. Group Conversation 1
        conv_g1 = Conversation(type="group", name="Project Alpha", created_by=users[0].id)
        db.add(conv_g1)
        await db.commit()
        await db.refresh(conv_g1)
        
        pg1_1 = ConversationParticipant(conversation_id=conv_g1.id, user_id=users[0].id, role="admin")
        pg1_2 = ConversationParticipant(conversation_id=conv_g1.id, user_id=users[1].id, role="admin") # non-creator admin
        pg1_3 = ConversationParticipant(conversation_id=conv_g1.id, user_id=users[2].id, role="member")
        pg1_4 = ConversationParticipant(conversation_id=conv_g1.id, user_id=users[3].id, role="member")
        db.add_all([pg1_1, pg1_2, pg1_3, pg1_4])
        await db.commit()
        
        msgs_g1 = await create_messages(conv_g1, [pg1_1, pg1_2, pg1_3, pg1_4])
        
        for p in [pg1_1, pg1_2, pg1_3, pg1_4]:
            p.last_read_message_id = msgs_g1[-1].id
            p.last_delivered_message_id = msgs_g1[-1].id
        db.add_all([pg1_1, pg1_2, pg1_3, pg1_4])
        await db.commit()

        # 7. Group Conversation 2 (mixed states)
        conv_g2 = Conversation(type="group", name="Weekend Plans", created_by=users[4].id)
        db.add(conv_g2)
        await db.commit()
        await db.refresh(conv_g2)
        
        pg2_1 = ConversationParticipant(conversation_id=conv_g2.id, user_id=users[4].id, role="admin")
        pg2_2 = ConversationParticipant(conversation_id=conv_g2.id, user_id=users[5].id, role="member")
        pg2_3 = ConversationParticipant(conversation_id=conv_g2.id, user_id=users[6].id, role="member")
        db.add_all([pg2_1, pg2_2, pg2_3])
        await db.commit()
        
        msgs_g2 = await create_messages(conv_g2, [pg2_1, pg2_2, pg2_3])
        
        pg2_1.last_read_message_id = msgs_g2[-1].id
        pg2_1.last_delivered_message_id = msgs_g2[-1].id
        
        pg2_2.last_read_message_id = msgs_g2[-5].id
        pg2_2.last_delivered_message_id = msgs_g2[-3].id # some delivered, some not
        
        pg2_3.last_read_message_id = msgs_g2[-1].id
        pg2_3.last_delivered_message_id = msgs_g2[-1].id
        db.add_all([pg2_1, pg2_2, pg2_3])
        await db.commit()

        print("Seed complete.")

if __name__ == "__main__":
    asyncio.run(seed())
