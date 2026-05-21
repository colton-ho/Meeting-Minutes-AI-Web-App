# Meeting-Minutes-AI-Web-App

A fully offline AI-powered meeting minutes web application using Python FastAPI, React, TypeScript, Tailwind CSS, and SQLite.

## Architecture

- Backend: `FastAPI` with local OpenAI-compatible ASR and LLM endpoints
- Frontend: `React` + `TypeScript` + `Tailwind CSS`
- Audio: REST file upload plus WebSocket streaming for live audio processing
- Database: `SQLite` local storage for meeting notes

## Local Services

The application expects the following local services to be available:

- ASR endpoint: `http://localhost:8001/v1/audio/transcriptions`
- LLM endpoint: `http://localhost:11434/v1/chat/completions`

## Setup

1. Install frontend dependencies:

```bash
cd frontend
npm install
```

2. Run the app with Docker Compose:

```bash
docker compose up --build
```

3. Open the frontend at:

```text
http://localhost:5173
```

## Notes

- The backend service proxies audio and summarization requests to your local ASR and LLM services.
- The frontend uses Tailwind CSS and Vite for fast development.
- SQLite persistence is stored in `backend/meeting_notes.db`.
