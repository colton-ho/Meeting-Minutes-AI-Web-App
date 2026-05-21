import os

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database.models import Base

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./data/meetings/meeting_notes.db",
)

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    future=True,
    echo=False,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


from backend.app.database.crud import (
    create_meeting,
    delete_meeting,
    get_meeting,
    list_meetings,
    search_meetings,
    update_meeting,
)

__all__ = [
    "Base",
    "DATABASE_URL",
    "engine",
    "AsyncSessionLocal",
    "init_db",
    "get_session",
    "create_meeting",
    "get_meeting",
    "list_meetings",
    "update_meeting",
    "delete_meeting",
    "search_meetings",
]
