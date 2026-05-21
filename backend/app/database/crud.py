from datetime import datetime
from typing import Any

from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.models import Meeting


def _auto_title(title: str | None, minutes: str, transcript: str) -> str:
    if title:
        return title
    source = minutes or transcript
    excerpt = source.strip()[:50]
    return excerpt or "Meeting"


async def create_meeting(
    session: AsyncSession,
    transcript: str,
    minutes: str,
    language: str = "und",
    recorded_at: datetime | None = None,
    duration_seconds: float = 0.0,
    audio_filename: str | None = None,
    title: str | None = None,
) -> Meeting:
    meeting = Meeting(
        title=_auto_title(title, minutes, transcript),
        transcript=transcript,
        minutes=minutes,
        language=language,
        recorded_at=recorded_at or datetime.utcnow(),
        duration_seconds=duration_seconds,
        audio_filename=audio_filename,
    )
    session.add(meeting)
    await session.commit()
    await session.refresh(meeting)
    return meeting


async def get_meeting(session: AsyncSession, meeting_id: str) -> Meeting | None:
    result = await session.execute(select(Meeting).where(Meeting.id == meeting_id))
    return result.scalar_one_or_none()


async def list_meetings(session: AsyncSession) -> list[Meeting]:
    result = await session.execute(select(Meeting).order_by(Meeting.recorded_at.desc()))
    return result.scalars().all()


async def update_meeting(session: AsyncSession, meeting_id: str, **fields: Any) -> Meeting | None:
    meeting = await get_meeting(session, meeting_id)
    if meeting is None:
        return None

    for key, value in fields.items():
        if hasattr(meeting, key) and key != "id":
            setattr(meeting, key, value)

    if not fields.get("title") and fields.get("minutes"):
        meeting.title = _auto_title(None, meeting.minutes, meeting.transcript)

    await session.commit()
    await session.refresh(meeting)
    return meeting


async def delete_meeting(session: AsyncSession, meeting_id: str) -> bool:
    result = await session.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        return False

    await session.delete(meeting)
    await session.commit()
    return True


async def search_meetings(session: AsyncSession, keyword: str) -> list[Meeting]:
    statement = text(
        "SELECT m.id, m.title, m.recorded_at, m.duration_seconds, m.audio_filename, "
        "m.transcript, m.minutes, m.language, m.created_at, m.updated_at "
        "FROM meetings m "
        "JOIN meetings_fts f ON f.meeting_id = m.id "
        "WHERE f MATCH :keyword "
        "ORDER BY m.recorded_at DESC"
    )
    result = await session.execute(statement, {"keyword": keyword})
    return [Meeting(**row._mapping) for row in result.mappings().all()]
