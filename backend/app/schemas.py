from pydantic import BaseModel


class TranscriptionResponse(BaseModel):
    transcript: str
    note_id: str


class UploadResponse(BaseModel):
    transcript: str
    minutes: str
    meeting_id: str


class MeetingHistoryResponse(BaseModel):
    id: str
    title: str
    recorded_at: str
    duration_seconds: float
    language: str
    transcript: str
    minutes: str


class SummarizeRequest(BaseModel):
    meeting_title: str
    transcript: str


class SummaryResponse(BaseModel):
    summary: str


class MeetingNoteResponse(BaseModel):
    id: str
    title: str
    transcript: str
    summary: str | None
