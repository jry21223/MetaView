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
from app.infrastructure.tts.volcano_ws import (
    DEFAULT_ENDPOINT as DEFAULT_WS_ENDPOINT,
)
from app.infrastructure.tts.volcano_ws import (
    DEFAULT_RESOURCE_ID,
    WEBSOCKET_DIALECT,
)
from app.infrastructure.tts.volcano_ws import synthesize as synthesize_over_websocket

__all__ = [
    "TtsRequest",
    "audio_from_json",
    "build_tts_request",
    "decode_audio_field",
    "looks_like_audio",
    "resolve_base_url",
    "response_audio",
    "to_spoken",
    "DEFAULT_RESOURCE_ID",
    "DEFAULT_WS_ENDPOINT",
    "WEBSOCKET_DIALECT",
    "synthesize_over_websocket",
]
