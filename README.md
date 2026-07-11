# Signal Clone

A fully functional, real-time messaging application inspired by Signal, built as a full-stack SDE assignment.

This project focuses on replicating Signal's clean, privacy-focused design, user experience, and core messaging workflows. It supports one-on-one and group conversations, real-time messaging, read receipts, typing indicators, reactions, and attachments.

## 🚀 Features

### Core Functionality
- **Authentication & Onboarding**: Mocked registration/login flow using phone numbers/usernames. Users can set their display name and profile avatar with session persistence.
- **Real-Time Messaging**: Instant one-on-one and group messaging powered by WebSockets.
- **Conversations & Contacts**: 
  - Left-hand conversation list sorted by recent activity.
  - Unread message indicators and last-message previews.
  - Search functionality for contacts and conversations.
  - Online and last-seen indicators.
- **Group Messaging**: Create groups, add/remove members (admin controls), and send messages to multiple participants.
- **Message Status & Indicators**: Real-time typing indicators, delivery receipts (single check), and read receipts (double check).

### 🌟 Bonus Features Implemented
- **Message Reactions**: React to messages with emojis.
- **Rich Media / Attachments**: Send and receive files and images.
- **Reply / Quoted Messages**: Reply to specific messages in a thread.
- **Disappearing Messages**: UI placeholders and functional foundation for disappearing messages.
- **Responsive Design**: Signal-like UI that works seamlessly across desktop and mobile.

---

## 🛠️ Tech Stack

**Frontend:**
- [Next.js](https://nextjs.org/) (React framework)
- TypeScript
- Vanilla CSS (Signal-like design system)
- Lucide React (Icons)

**Backend:**
- [FastAPI](https://fastapi.tiangolo.com/) (Python web framework)
- WebSockets (Real-time bi-directional communication)
- SQLAlchemy (ORM)
- Alembic (Database migrations)
- SQLite (Database)

---

## 🏗️ Architecture Overview

The application follows a modern decoupled client-server architecture:

1. **Frontend (Next.js)**: 
   - Handles the UI/UX, built to closely resemble Signal's native desktop/web client.
   - Manages local state and WebSocket connections for real-time updates.
   - Communicates with the backend via REST APIs for initial data fetching and WebSockets for real-time events.

2. **Backend (FastAPI)**:
   - Exposes RESTful endpoints for authentication, fetching conversations, and managing contacts.
   - Maintains an active WebSocket Connection Manager that handles connected clients, broadcasting messages, typing events, and read/delivery receipts efficiently.

3. **Database (SQLite)**:
   - Relational database storing users, contacts, conversations, messages, and reactions.
   - Designed for easy setup and testing, while the schema is production-ready for PostgreSQL.

---

## 🗄️ Database Schema

The database schema is designed to efficiently support both direct and group messaging:

- **Users**: Stores `id`, `phone_number`, `username`, `display_name`, `avatar_url`, `status`.
- **Contacts**: Self-referential many-to-many relationship linking a user to their saved contacts.
- **Conversations**: Represents a chat thread. Contains `id`, `type` (direct/group), `name`, `last_message_preview`, `created_at`.
- **ConversationParticipants**: A join table linking `Users` and `Conversations`. Stores participant `role` (member/admin) and tracks `last_read_message_id` and `last_delivered_message_id` for receipts.
- **Messages**: Stores message data, including `conversation_id`, `sender_id`, `content`, `reply_to_id` (for quotes), `file_url`, and `created_at`.
- **Reactions**: Links users to messages with an `emoji`.

---

## ⚙️ Setup Instructions

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 1. Backend Setup

Navigate to the `backend` directory:
```bash
cd backend
```

Create and activate a virtual environment:
```bash
python -m venv venv
# On Windows
venv\Scripts\activate
# On Mac/Linux
source venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Set up environment variables:
```bash
cp .env.example .env
```
*(Update the `.env` file with any necessary configurations)*

Run database migrations:
```bash
alembic upgrade head
```

*(Optional)* Seed the database with sample data:
```bash
python -m app.seed.seed_data
```
