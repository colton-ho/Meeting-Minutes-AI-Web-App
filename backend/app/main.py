from fastapi import FastAPI

from backend.app.api import router
from backend.app.database import init_db

app = FastAPI(
    title="Meeting Minutes AI Backend",
    description="Offline meeting transcription and summarization service.",
    version="0.1.0",
)
app.include_router(router, prefix="/api")


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()
