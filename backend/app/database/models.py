import uuid

from sqlalchemy import Column, DateTime, Float, String, Text, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    duration_seconds = Column(Float, nullable=False, default=0.0)
    audio_filename = Column(String(1024), nullable=True)
    transcript = Column(Text, nullable=False)
    minutes = Column(Text, nullable=False)
    language = Column(String(16), nullable=False, default="und")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Meeting id={self.id} title={self.title!r}>"
