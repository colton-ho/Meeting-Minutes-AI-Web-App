import os

ASR_ENDPOINT = os.environ.get(
    "ASR_URL",
    os.environ.get("ASR_ENDPOINT", "http://localhost:8001/v1/audio/transcriptions"),
)
LLM_ENDPOINT = os.environ.get(
    "LLM_URL",
    os.environ.get("LLM_ENDPOINT", "http://localhost:11434/v1/chat/completions"),
)
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3-30b-a3b")
