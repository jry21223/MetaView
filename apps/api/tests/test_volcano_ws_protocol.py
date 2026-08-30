"""火山引擎 v3 TTS WebSocket framing.

A wrong header byte here does not raise — the socket just closes with no
diagnosis — so the frames are pinned against golden vectors produced by
ByteDance's own ``protocols.py`` sample (the ``websocket unidirectional``
download). If a refactor shifts a field by one byte, these fail loudly
instead of the deployment failing silently.
"""

from __future__ import annotations

import json
import struct

import pytest

from app.infrastructure.tts.volcano_ws import (
    Event,
    Flag,
    Message,
    MsgType,
    build_session_payload,
    connect_headers,
)

SESSION_ID = "8f14e45f-ceea-467a-9c1e-1b0f2d3c4b5a"

# Captured from the vendor sample's Message.marshal() — not hand-computed.
VENDOR_FRAMES = {
    "start_connection": "1114100000000001000000027b7d",
    "finish_connection": "1114100000000002000000027b7d",
    "start_session": (
        "1114100000000064000000243866313465343566"
        "2d636565612d343637612d396331652d3162306632643363346235"
        "61000000077b2261223a317d"
    ),
    "finish_session": (
        "1114100000000066000000243866313465343566"
        "2d636565612d343637612d396331652d3162306632643363346235"
        "61000000027b7d"
    ),
}


def _client(event: Event, session_id: str = "", payload: bytes = b"{}") -> bytes:
    return Message(
        type=MsgType.FULL_CLIENT_REQUEST,
        flag=Flag.WITH_EVENT,
        event=event,
        session_id=session_id,
        payload=payload,
    ).marshal()


@pytest.mark.parametrize(
    ("name", "frame"),
    [
        ("start_connection", _client(Event.START_CONNECTION)),
        ("finish_connection", _client(Event.FINISH_CONNECTION)),
        ("start_session", _client(Event.START_SESSION, SESSION_ID, b'{"a":1}')),
        ("finish_session", _client(Event.FINISH_SESSION, SESSION_ID)),
    ],
)
def test_client_frames_match_the_vendor_encoder_byte_for_byte(name, frame) -> None:
    assert frame.hex() == VENDOR_FRAMES[name]


def test_the_header_is_the_four_bytes_the_protocol_specifies() -> None:
    frame = _client(Event.START_CONNECTION)
    assert frame[0] == 0x11  # version 1, header size 1 (×4 bytes)
    assert frame[1] == (MsgType.FULL_CLIENT_REQUEST << 4) | Flag.WITH_EVENT
    assert frame[2] == 0x10  # JSON serialization, no compression
    assert frame[3] == 0x00  # padding out to four bytes


def test_connection_events_omit_the_session_id_entirely() -> None:
    """Not a zero length — the field is absent, which shifts every byte after."""
    connection = _client(Event.START_CONNECTION)
    session = _client(Event.START_SESSION, SESSION_ID)
    assert len(connection) == 4 + 4 + 4 + 2  # header, event, payload size, "{}"
    assert len(session) == len(connection) + 4 + len(SESSION_ID)


def test_audio_frames_from_the_server_round_trip() -> None:
    audio = b"\xff\xfb\x90\x00AUDIO"
    frame = bytes([0x11, (MsgType.AUDIO_ONLY_SERVER << 4) | Flag.WITH_EVENT, 0x10, 0x00])
    frame += struct.pack(">i", Event.TTS_RESPONSE)
    frame += struct.pack(">I", len(SESSION_ID)) + SESSION_ID.encode()
    frame += struct.pack(">I", len(audio)) + audio

    message = Message.from_bytes(frame)
    assert message.type == MsgType.AUDIO_ONLY_SERVER
    assert message.event == Event.TTS_RESPONSE
    assert message.session_id == SESSION_ID
    assert message.payload == audio


def test_connection_started_carries_a_connect_id_before_its_payload() -> None:
    # The one server frame whose layout differs: no session id, but a connect
    # id sitting where the session id would be.
    connect_id, body = b"conn-abc-123", b'{"ok":true}'
    frame = bytes([0x11, (MsgType.FULL_SERVER_RESPONSE << 4) | Flag.WITH_EVENT, 0x10, 0x00])
    frame += struct.pack(">i", Event.CONNECTION_STARTED)
    frame += struct.pack(">I", len(connect_id)) + connect_id
    frame += struct.pack(">I", len(body)) + body

    message = Message.from_bytes(frame)
    assert message.event == Event.CONNECTION_STARTED
    assert message.connect_id == "conn-abc-123"
    assert message.payload == body
    assert message.session_id == ""


def test_an_error_frame_reads_its_code_and_stays_describable() -> None:
    body = b'{"message":"invalid speaker"}'
    frame = bytes([0x11, (MsgType.ERROR << 4) | Flag.NO_SEQ, 0x10, 0x00])
    frame += struct.pack(">I", 45000001)
    frame += struct.pack(">I", len(body)) + body

    message = Message.from_bytes(frame)
    assert message.error_code == 45000001
    assert "invalid speaker" in message.describe()


def test_a_short_frame_is_rejected_rather_than_silently_misparsed() -> None:
    with pytest.raises(ValueError, match="too short"):
        Message.from_bytes(b"\x11\x14")


def test_the_session_payload_carries_the_documented_required_fields() -> None:
    payload = json.loads(build_session_payload(text="两球同时落地。", speaker="BV700_streaming"))
    params = payload["req_params"]
    assert params["text"] == "两球同时落地。"
    assert params["speaker"] == "BV700_streaming"
    assert params["audio_params"]["format"] == "mp3"
    # additions travels as a JSON *string*, per the vendor's field type.
    assert json.loads(params["additions"])["explicit_language"] == "zh-cn"


def test_the_session_payload_leaves_the_parenthesis_filter_off() -> None:
    """Our parentheses hold coordinates like (-1,2.4), never asides."""
    additions = json.loads(json.loads(build_session_payload(text="x", speaker="v"))["req_params"]["additions"])
    assert "max_length_to_filter_parenthesis" not in additions


def test_each_connection_declares_the_model_and_a_fresh_request_id() -> None:
    first = connect_headers(api_key="k", resource_id="seed-tts-2.0")
    second = connect_headers(api_key="k", resource_id="seed-tts-2.0")
    assert first["X-Api-Key"] == "k"
    assert first["X-Api-Resource-Id"] == "seed-tts-2.0"
    assert first["X-Api-Request-Id"] != second["X-Api-Request-Id"]
