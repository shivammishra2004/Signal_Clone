from fastapi import FastAPI
import asyncio
import urllib.request
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

async def keep_awake():
    """Background task to keep Render free tier awake by pinging itself every 14 minutes"""
    while True:
        try:
            url = "https://signal-clone-api-v2qz.onrender.com/health"
            logger.info(f"Pinging {url} to keep Render awake...")
            # Use a timeout to prevent hanging
            urllib.request.urlopen(url, timeout=10)
        except Exception as e:
            logger.error(f"Failed to ping self: {e}")
        
        # Render sleeps after 15 mins of inactivity, so ping every 14 mins
        await asyncio.sleep(14 * 60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background task
    task = asyncio.create_task(keep_awake())
    yield
    # Cancel the task on shutdown
    task.cancel()
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(title="Signal Clone API", lifespan=lifespan)

# Setup CORS
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.endpoints import auth, contacts, conversations, messages
from app.ws.router import router as ws_router

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(messages.router, prefix="/conversations", tags=["messages"])
app.include_router(ws_router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}
