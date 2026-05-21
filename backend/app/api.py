import array
import json
from typing import Optional

from fastapi import APIRouter, File, UploadFile, WebSocket, WebSocketDisconnect

from backend.app import database, schemas, services

router = APIRouter()

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2
MAX_BUFFER_SECONDS = 3.0
MAX_BUFFER_SIZE = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MAX_BUFFER_SECONDS)
SILENCE_WINDOW_SECONDS = 0.5
SILENCE_WINDOW_SIZE = int(SAMPLE_RATE * BYTES_PER_SAMPLE * SILENCE_WINDOW_SECONDS)
SILENCE_THRESHOLD = 500.0


def _is_silence(frame: bytes, threshold: float = SILENCE_THRESHOLD) -> bool:
    if len(frame) < 2:
        return True

    samples = array.array("h")
    samples.frombytes(frame if len(frame) % 2 == 0 else frame[:-1])
    if not samples:
        return True

    energy = sum(sample * sample for sample in samples) / len(samples)
    return energy ** 0.5 < threshold


def _should_flush_buffer(buffer: bytearray) -> bool:
    if len(buffer) >= MAX_BUFFER_SIZE:
        return True
    if len(buffer) >= SILENCE_WINDOW_SIZE:
        return _is_silence(buffer[-SILENCE_WINDOW_SIZE:])
    return False


@router.get("/health")
def health_check() -> dict:
    return {"status": "ok", "service": "meeting-minutes-ai"}


@router.post("/transcribe", response_model=schemas.TranscriptionResponse)
async def upload_audio(file: UploadFile = File(...)) -> schemas.TranscriptionResponse:
    audio_bytes = await file.read()
    result = await services.transcribe_audio_bytes(audio_bytes)
    transcript = result.get("text", "")
    async with database.AsyncSessionLocal() as session:
        meeting = await database.create_meeting(
            session=session,
            transcript=transcript,
            minutes=transcript,
            audio_filename=file.filename,
        )
    return schemas.TranscriptionResponse(transcript=transcript, note_id=meeting.id)


@router.post("/upload", response_model=schemas.UploadResponse)
async def upload_meeting(file: UploadFile = File(...)) -> schemas.UploadResponse:
    audio_bytes = await file.read()
    result = await services.transcribe_audio_bytes(audio_bytes)
    transcript = result.get("text", "")
    summary = await services.summarize_transcript(transcript, file.filename)
    async with database.AsyncSessionLocal() as session:
        meeting = await database.create_meeting(
            session=session,
            transcript=transcript,
            minutes=summary,
            audio_filename=file.filename,
        )
    return schemas.UploadResponse(transcript=transcript, minutes=summary, meeting_id=meeting.id)


@router.post("/summarize", response_model=schemas.SummaryResponse)
async def summarize_text(request: schemas.SummarizeRequest) -> schemas.SummaryResponse:
    summary = await services.summarize_transcript(request.transcript, request.meeting_title)
    return schemas.SummaryResponse(summary=summary)


@router.get("/notes", response_model=list[schemas.MeetingNoteResponse])
async def list_meeting_notes() -> list[schemas.MeetingNoteResponse]:
    async with database.AsyncSessionLocal() as session:
        meetings = await database.list_meetings(session)
    return [
        schemas.MeetingNoteResponse(
            id=meeting.id,
            title=meeting.title,
            transcript=meeting.transcript,
            summary=meeting.minutes,
        )
        for meeting in meetings
    ]


@router.get("/meetings", response_model=list[schemas.MeetingHistoryResponse])
async def list_meetings() -> list[schemas.MeetingHistoryResponse]:
    async with database.AsyncSessionLocal() as session:
        meetings = await database.list_meetings(session)
    return [
        schemas.MeetingHistoryResponse(
            id=meeting.id,
            title=meeting.title,
            recorded_at=meeting.recorded_at.isoformat(),
            duration_seconds=meeting.duration_seconds,
            language=meeting.language,
            transcript=meeting.transcript,
            minutes=meeting.minutes,
        )
        for meeting in meetings
    ]


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str) -> dict[str, str]:
    async with database.AsyncSessionLocal() as session:
        deleted = await database.delete_meeting(session, meeting_id)
    return {"status": "deleted" if deleted else "not_found"}


@router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket) -> None:
    await websocket.accept()
    audio_buffer = bytearray()
    transcript_parts: list[str] = []

    try:
        while True:
            message = await websocket.receive()
            message_type = message.get("type")
            if message_type == "websocket.disconnect":
                break

            if message_type == "websocket.bytes":
                audio_chunk = message.get("bytes", b"")
                if not audio_chunk:
                    continue
                audio_buffer.extend(audio_chunk)
                if _should_flush_buffer(audio_buffer):
                    result = await services.transcribe_audio_bytes(bytes(audio_buffer))
                    chunk_text = result.get("text", "")
                    if chunk_text:
                        transcript_parts.append(chunk_text)
                    await websocket.send_json(
                        {
                            "type": "transcript_chunk",
                            "text": chunk_text,
                            "is_final": False,
                        }
                    )
                    audio_buffer.clear()
                continue

            if message_type == "websocket.text":
                text = message.get("text", "")
                if text == "END":
                    break
                if text:
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict) and parsed.get("type") == "stop":
                            break
                    except Exception:
                        pass
                continue

        if audio_buffer:
            result = await services.transcribe_audio_bytes(bytes(audio_buffer))
            chunk_text = result.get("text", "")
            if chunk_text:
                transcript_parts.append(chunk_text)
            await websocket.send_json(
                {
                    "type": "transcript_chunk",
                    "text": chunk_text,
                    "is_final": True,
                }
            )

        full_text = " ".join(part.strip() for part in transcript_parts if part).strip()
        await websocket.send_json({"type": "transcript_complete", "full_text": full_text})

        minutes_text = ""
        async for chunk in services.generate_meeting_minutes(full_text):
            if chunk:
                minutes_text += chunk
                await websocket.send_json({"type": "minutes_chunk", "text": chunk})

        async with database.AsyncSessionLocal() as session:
            meeting = await database.create_meeting(
                session=session,
                transcript=full_text,
                minutes=minutes_text,
                audio_filename=None,
                title=None,
            )

        await websocket.send_json(
            {
                "type": "minutes_complete",
                "minutes": minutes_text,
                "meeting_id": meeting.id,
            }
        )
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "error": str(exc)})
        except Exception:
            pass
        await websocket.close()
