"""火山引擎 v3 unidirectional TTS over WebSocket.

The new 语音合成大模型 (``seed-tts-2.0``) does not speak HTTP: it takes one
authenticated WebSocket, a handshake of binary framed events, and streams the
audio back in chunks. The framing below is transcribed from ByteDance's own
``protocols.py`` sample and pinned byte-for-byte by tests, because a wrong
header byte shows up as a socket that closes with no diagnosis at all.

    ┌ byte 0 ┬ byte 1 ┬ byte 2 ┬ byte 3 ┐
    │ ver|hdr│type|flg│ ser|cmp│ padding│   then, for an event message:
    └────────┴────────┴────────┴────────┘   int32 event, uint32+bytes session
                                            id, uint32+bytes payload

Session flow: StartConnection → ConnectionStarted → StartSession (carrying the
text) → SessionStarted → a stream of TTSResponse audio chunks → SessionFinished.
"""

from __future__ import annotations

import io
import json
import struct
import uuid
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Final

from app.infrastructure.tts.dialects import build_v3_req_params, v3_headers

DEFAULT_ENDPOINT: Final = "wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream"
DEFAULT_RESOURCE_ID: Final = "seed-tts-2.0"
# The provider value that selects this transport.
WEBSOCKET_DIALECT: Final = "volcano_ws"


class MsgType(IntEnum):
    FULL_CLIENT_REQUEST = 0b1
    AUDIO_ONLY_CLIENT = 0b10
    FULL_SERVER_RESPONSE = 0b1001
    AUDIO_ONLY_SERVER = 0b1011
    FRONT_END_RESULT_SERVER = 0b1100
    ERROR = 0b1111


class Flag(IntEnum):
    NO_SEQ = 0
    POSITIVE_SEQ = 0b1
    LAST_NO_SEQ = 0b10
    NEGATIVE_SEQ = 0b11
    WITH_EVENT = 0b100


class Event(IntEnum):
    NONE = 0
    START_CONNECTION = 1
    FINISH_CONNECTION = 2
    CONNECTION_STARTED = 50
    CONNECTION_FAILED = 51
    CONNECTION_FINISHED = 52
    START_SESSION = 100
    CANCEL_SESSION = 101
    FINISH_SESSION = 102
    SESSION_STARTED = 150
    SESSION_CANCELED = 151
    SESSION_FINISHED = 152
    SESSION_FAILED = 153
    USAGE_RESPONSE = 154
    TASK_REQUEST = 200
    TTS_SENTENCE_START = 350
    TTS_SENTENCE_END = 351
    TTS_RESPONSE = 352
    TTS_ENDED = 359
    TTS_SUBTITLE = 364


_VERSION_1: Final = 1
_HEADER_SIZE_4: Final = 1  # in 4-byte units
_SERIALIZATION_JSON: Final = 0b1
_COMPRESSION_NONE: Final = 0

# Connection-scoped events carry no session id — not even a zero length.
# The vendor's two skip lists differ by CONNECTION_FINISHED (a server-only
# event, so its absence on the write side never fires); mirrored exactly here
# rather than unified, so this stays a faithful transcription.
_NO_SESSION_ID_WRITE: Final = frozenset(
    {
        Event.START_CONNECTION,
        Event.FINISH_CONNECTION,
        Event.CONNECTION_STARTED,
        Event.CONNECTION_FAILED,
    }
)
_NO_SESSION_ID_READ: Final = _NO_SESSION_ID_WRITE | {Event.CONNECTION_FINISHED}
# ...and these carry a connect id instead, after the (absent) session id.
_WITH_CONNECT_ID: Final = frozenset(
    {Event.CONNECTION_STARTED, Event.CONNECTION_FAILED, Event.CONNECTION_FINISHED}
)
_SEQUENCED: Final = frozenset({Flag.POSITIVE_SEQ, Flag.NEGATIVE_SEQ})
_PAYLOAD_TYPES: Final = frozenset(
    {
        MsgType.FULL_CLIENT_REQUEST,
        MsgType.FULL_SERVER_RESPONSE,
        MsgType.FRONT_END_RESULT_SERVER,
        MsgType.AUDIO_ONLY_CLIENT,
        MsgType.AUDIO_ONLY_SERVER,
    }
)


@dataclass
class Message:
    """One framed protocol message."""

    type: MsgType
    flag: Flag = Flag.NO_SEQ
    event: int = Event.NONE
    session_id: str = ""
    connect_id: str = ""
    sequence: int = 0
    error_code: int = 0
    payload: bytes = field(default=b"")

    def marshal(self) -> bytes:
        buffer = io.BytesIO()
        buffer.write(
            bytes(
                [
                    (_VERSION_1 << 4) | _HEADER_SIZE_4,
                    (self.type << 4) | self.flag,
                    (_SERIALIZATION_JSON << 4) | _COMPRESSION_NONE,
                    0,  # header padding out to 4 bytes
                ]
            )
        )
        if self.flag == Flag.WITH_EVENT:
            buffer.write(struct.pack(">i", self.event))
            if self.event not in _NO_SESSION_ID_WRITE:
                encoded = self.session_id.encode("utf-8")
                buffer.write(struct.pack(">I", len(encoded)))
                buffer.write(encoded)
        if self.type in _PAYLOAD_TYPES and self.flag in _SEQUENCED:
            buffer.write(struct.pack(">i", self.sequence))
        elif self.type == MsgType.ERROR:
            buffer.write(struct.pack(">I", self.error_code))
        buffer.write(struct.pack(">I", len(self.payload)))
        buffer.write(self.payload)
        return buffer.getvalue()

    @classmethod
    def from_bytes(cls, data: bytes) -> "Message":
        if len(data) < 4:
            raise ValueError(f"frame too short: {len(data)} bytes")
        header_size = (data[0] & 0b1111) * 4
        msg = cls(type=MsgType(data[1] >> 4), flag=Flag(data[1] & 0b1111))

        buffer = io.BytesIO(data)
        buffer.read(header_size)

        def _read_u32() -> int:
            raw = buffer.read(4)
            return struct.unpack(">I", raw)[0] if len(raw) == 4 else 0

        # The server writes sequence before the event block, the mirror image
        # of the client order above; this asymmetry is the vendor's.
        if msg.type in _PAYLOAD_TYPES and msg.flag in _SEQUENCED:
            raw = buffer.read(4)
            if len(raw) == 4:
                msg.sequence = struct.unpack(">i", raw)[0]
        elif msg.type == MsgType.ERROR:
            msg.error_code = _read_u32()

        if msg.flag == Flag.WITH_EVENT:
            raw = buffer.read(4)
            if len(raw) == 4:
                msg.event = struct.unpack(">i", raw)[0]
            if msg.event not in _NO_SESSION_ID_READ:
                size = _read_u32()
                if size:
                    msg.session_id = buffer.read(size).decode("utf-8", "replace")
            if msg.event in _WITH_CONNECT_ID:
                size = _read_u32()
                if size:
                    msg.connect_id = buffer.read(size).decode("utf-8", "replace")

        size = _read_u32()
        if size:
            msg.payload = buffer.read(size)
        return msg

    def describe(self) -> str:
        """Human-readable form for error messages — never the happy path."""
        try:
            event = Event(self.event).name
        except ValueError:
            event = f"Event({self.event})"
        body = self.payload[:200].decode("utf-8", "replace")
        return f"{self.type.name}/{event} payload={body!r}"


def build_session_payload(**kwargs: Any) -> bytes:
    """The StartSession body — the same req_params the HTTP transport sends."""

    return json.dumps(build_v3_req_params(**kwargs), ensure_ascii=False).encode("utf-8")


def connect_headers(*, api_key: str, resource_id: str) -> dict[str, str]:
    """The v3 headers, minus the Content-Type an upgrade request has no use for."""

    headers = v3_headers(api_key=api_key, resource_id=resource_id)
    headers.pop("Content-Type", None)
    return headers


def _event_message(event: Event, *, session_id: str = "", payload: bytes = b"{}") -> Message:
    return Message(
        type=MsgType.FULL_CLIENT_REQUEST,
        flag=Flag.WITH_EVENT,
        event=event,
        session_id=session_id,
        payload=payload,
    )


async def synthesize(
    *,
    text: str,
    api_key: str,
    speaker: str,
    endpoint: str = DEFAULT_ENDPOINT,
    resource_id: str = DEFAULT_RESOURCE_ID,
    audio_format: str = "mp3",
    speech_rate: int = 0,
    timeout_s: float = 60.0,
) -> bytes:
    """Synthesize one line, returning the whole audio container.

    Streaming is the transport, not the product: the export pipeline needs a
    finished file per narration step, so the chunks are joined here.
    """

    from websockets.asyncio.client import connect  # imported late: optional dep

    session_id = str(uuid.uuid4())
    chunks: list[bytes] = []

    try:
        opened = connect(
            endpoint,
            additional_headers=connect_headers(api_key=api_key, resource_id=resource_id),
            open_timeout=timeout_s,
            close_timeout=5,
            max_size=None,
        )
        socket = await opened.__aenter__()
    except Exception as exc:  # noqa: BLE001 — DNS, TLS, proxy, 401: all one story
        raise RuntimeError(f"cannot reach {endpoint}: {type(exc).__name__}: {exc}") from exc

    try:

        async def expect(*wanted: Event) -> Message:
            while True:
                frame = await socket.recv()
                if isinstance(frame, str):
                    raise RuntimeError(f"volcano sent text, expected a frame: {frame[:200]}")
                message = Message.from_bytes(frame)
                if message.type == MsgType.ERROR or message.event in (
                    Event.CONNECTION_FAILED,
                    Event.SESSION_FAILED,
                ):
                    raise RuntimeError(f"volcano TTS refused the request: {message.describe()}")
                if message.event in wanted:
                    return message

        await socket.send(_event_message(Event.START_CONNECTION).marshal())
        await expect(Event.CONNECTION_STARTED)

        await socket.send(
            _event_message(
                Event.START_SESSION,
                session_id=session_id,
                payload=build_session_payload(
                    text=text,
                    speaker=speaker,
                    audio_format=audio_format,
                    speech_rate=speech_rate,
                ),
            ).marshal()
        )
        await expect(Event.SESSION_STARTED)

        while True:
            frame = await socket.recv()
            if isinstance(frame, str):
                raise RuntimeError(f"volcano sent text mid-stream: {frame[:200]}")
            message = Message.from_bytes(frame)
            if message.type == MsgType.ERROR or message.event == Event.SESSION_FAILED:
                raise RuntimeError(f"volcano TTS failed mid-stream: {message.describe()}")
            if message.type == MsgType.AUDIO_ONLY_SERVER and message.payload:
                chunks.append(message.payload)
            elif message.event in (Event.SESSION_FINISHED, Event.TTS_ENDED):
                break

        await socket.send(_event_message(Event.FINISH_CONNECTION).marshal())
    finally:
        await opened.__aexit__(None, None, None)

    audio = b"".join(chunks)
    if not audio:
        raise RuntimeError("volcano TTS finished the session without sending audio")
    return audio
