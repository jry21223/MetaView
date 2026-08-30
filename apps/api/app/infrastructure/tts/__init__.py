"""TTS vendor dialects.

One place that knows how each provider spells a synthesis request and how it
hands the audio back, so the export pipeline and the playback proxy stay in
agreement and adding a vendor stays a config change.
"""

from app.infrastructure.tts.dialects import (
    TtsRequest,
    audio_from_json,
    build_tts_request,
    decode_audio_field,
    looks_like_audio,
    resolve_base_url,
    response_audio,
)
from app.infrastructure.tts.narration import to_spoken

__all__ = [
    "TtsRequest",
    "audio_from_json",
    "build_tts_request",
    "decode_audio_field",
    "looks_like_audio",
    "resolve_base_url",
    "response_audio",
    "to_spoken",
]
