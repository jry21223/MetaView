from __future__ import annotations

import base64
import time
from pathlib import Path

import pytest

from app.config import Settings
from app.infrastructure.payment.wechat_pay import WeChatPayClient, WeChatPayGatewayError
from app.infrastructure.persistence.db_init import init_db


def test_wechat_notification_accepts_fresh_signature_and_rejects_replay(tmp_path: Path) -> None:
    client, key = _client(tmp_path)
    body = b'{"resource":{"ciphertext":"x","nonce":"n"}}'
    headers = _headers(key, body, timestamp=int(time.time()), nonce="nonce-1")

    client._verify_notification(headers, body)

    with pytest.raises(WeChatPayGatewayError, match="replay"):
        client._verify_notification(headers, body)


def test_wechat_notification_rejects_stale_and_future_timestamps(tmp_path: Path) -> None:
    client, key = _client(tmp_path)
    body = b'{"resource":{"ciphertext":"x","nonce":"n"}}'
    now = int(time.time())
    # Stay far from the 300s boundary: the client reads its own clock, and a
    # runner NTP step between the two readings once flipped a now-301 sample
    # back inside the window (CI-only DID NOT RAISE flake).
    an_hour = 3600

    with pytest.raises(WeChatPayGatewayError, match="timestamp"):
        client._verify_notification(
            _headers(key, body, timestamp=now - an_hour, nonce="stale"),
            body,
        )

    with pytest.raises(WeChatPayGatewayError, match="timestamp"):
        client._verify_notification(
            _headers(key, body, timestamp=now + an_hour, nonce="future"),
            body,
        )


def _client(tmp_path: Path):
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
    except ModuleNotFoundError:
        pytest.skip("cryptography is not installed")

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_key_path = tmp_path / "wechat-platform.pem"
    public_key_path.write_bytes(public_key)
    db_path = tmp_path / "wechat.db"
    init_db(str(db_path))
    settings = Settings(
        wechat_pay_platform_public_key_path=str(public_key_path),
        history_db_path=str(db_path),
        wechat_notify_max_skew_s=300,
        wechat_notify_replay_ttl_s=600,
        _env_file=None,
    )
    return WeChatPayClient(settings), key


def _headers(key, body: bytes, *, timestamp: int, nonce: str) -> dict[str, str]:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    message = f"{timestamp}\n{nonce}\n{body.decode('utf-8')}\n".encode("utf-8")
    signature = key.sign(message, padding.PKCS1v15(), hashes.SHA256())
    return {
        "wechatpay-timestamp": str(timestamp),
        "wechatpay-nonce": nonce,
        "wechatpay-signature": base64.b64encode(signature).decode("ascii"),
    }
