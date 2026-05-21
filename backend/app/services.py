import json
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from fastapi import UploadFile

from backend.app import config


ASR_TIMEOUT = 120.0
LLM_TIMEOUT = 300.0


def _normalize_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    text = str(payload.get("text", payload.get("transcript", "")))
    segments = payload.get("segments")
    if not isinstance(segments, list):
        segments = []
    language = str(payload.get("language", "und")) if payload.get("language") else "und"
    return {
        "text": text,
        "segments": segments,
        "language": language,
    }


async def transcribe_audio_file(file: UploadFile) -> Dict[str, Any]:
    body = await file.read()
    return await transcribe_audio_bytes(body)


async def transcribe_audio_bytes(audio_bytes: bytes) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=ASR_TIMEOUT) as client:
        files = {"file": ("audio.wav", audio_bytes, "audio/wav")}
        response = await client.post(config.ASR_ENDPOINT, files=files)
        response.raise_for_status()
        payload = response.json()

    if isinstance(payload, dict):
        return _normalize_response(payload)
    return _normalize_response({"text": str(payload), "segments": [], "language": "und"})


async def summarize_transcript(transcript: str, meeting_title: str) -> str:
    prompt = (
        "You are an AI meeting assistant. Create concise meeting minutes with key decisions, "
        "action items, and a short summary for the following transcript.\n\n"
        f"Meeting title: {meeting_title}\nTranscript:\n{transcript}"
    )
    payload = {
        "model": config.LLM_MODEL,
        "messages": [
            {"role": "system", "content": "You summarize meeting transcripts into minutes and action items."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 800,
    }

    async with httpx.AsyncClient(timeout=ASR_TIMEOUT) as client:
        response = await client.post(config.LLM_ENDPOINT, json=payload)
        response.raise_for_status()
        data = response.json()

    choices = data.get("choices", [])
    if not choices:
        raise ValueError("No response from LLM")

    message = choices[0].get("message", {})
    return message.get("content", "")


async def _parse_stream_line(line: str) -> Optional[str]:
    if not line or not line.startswith("data:"):
        return None

    data = line[len("data:"):].strip()
    if data == "[DONE]":
        return None

    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None

    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    choice = choices[0]
    delta = choice.get("delta", {})
    if not isinstance(delta, dict):
        return None

    return str(delta.get("content", ""))


async def _iter_stream_chunks(response: httpx.Response) -> AsyncGenerator[str, None]:
    async for line in response.aiter_lines():
        chunk = await _parse_stream_line(line)
        if chunk is not None:
            yield chunk


async def generate_meeting_minutes(
    transcript: str,
    participants_hint: Optional[str] = None,
    date_hint: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    messages = [
        {"role": "system", "content": "You are an AI meeting assistant who generates concise meeting minutes."},
        {
            "role": "user",
            "content": (
                "Please generate meeting minutes in Traditional Chinese for the following transcript.\n\n"
                f"Transcript:\n{transcript}\n"
                + (f"Participants hint: {participants_hint}\n" if participants_hint else "")
                + (f"Date hint: {date_hint}\n" if date_hint else "")
            ),
        },
    ]

    payload = {
        "model": config.LLM_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 2048,
        "stream": True,
    }

    timeout = httpx.Timeout(LLM_TIMEOUT, read=30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", config.LLM_ENDPOINT, json=payload) as response:
            response.raise_for_status()
            async for chunk in _iter_stream_chunks(response):
                yield chunk
