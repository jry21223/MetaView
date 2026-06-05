from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.application.use_cases.newapi_topup import encode_signed_payload
from app.config import get_settings
from app.domain.models.account import NativePaymentOrder, PaymentTransaction
from app.main import create_app
from app.presentation.dependencies import get_payment_gateway


@pytest.fixture
def newapi_topup_client(monkeypatch: pytest.MonkeyPatch, tmp_path):
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "newapi-topup.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_INTENT_SECRET", "intent-secret")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_RECEIPT_TOKEN", "receipt-token")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_DEV_MODE", "true")
    app = create_app()
    with TestClient(app) as client:
        yield client
    get_settings.cache_clear()


def test_newapi_topup_dev_receipt_flow(newapi_topup_client: TestClient) -> None:
    me = newapi_topup_client.get("/api/v1/account/me")
    assert me.status_code == 200
    assert me.json()["balance_cents"] == 0

    start = _start_topup(newapi_topup_client)
    assert start.status_code == 200
    assert "模拟支付成功并返回 NewAPI" in start.text
    intent_id = _extract_intent_id(start.text)

    paid = newapi_topup_client.post(
        f"/api/v1/newapi/topups/{intent_id}/dev-pay",
        follow_redirects=False,
    )
    assert paid.status_code == 303
    location = paid.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == (
        "http://localhost:3000/console/topup/metaview/callback"
    )
    assert query["state"] == ["state-1"]
    assert query["intent_id"] == [intent_id]
    assert query["receipt_code"][0].startswith("mvr_")

    receipt_code = query["receipt_code"][0]
    verified = newapi_topup_client.post(
        "/api/v1/internal/newapi/topup-receipts/verify",
        headers={"Authorization": "Bearer receipt-token"},
        json={
            "intent_id": intent_id,
            "receipt_code": receipt_code,
            "newapi_user_id": 4,
            "state": "state-1",
        },
    )
    assert verified.status_code == 200
    assert verified.json() == {
        "status": "verified",
        "intent_id": intent_id,
        "order_id": intent_id,
        "newapi_user_id": 4,
        "amount_cents": 500,
        "amount_yuan": "5.00",
        "quota_delta": 2_500_000,
        "paid_at": verified.json()["paid_at"],
    }

    acked = newapi_topup_client.post(
        "/api/v1/internal/newapi/topup-receipts/ack",
        headers={"Authorization": "Bearer receipt-token"},
        json={"intent_id": intent_id, "newapi_user_id": 4, "state": "state-1"},
    )
    assert acked.status_code == 200
    assert acked.json()["status"] == "acked"

    refreshed = newapi_topup_client.get("/api/v1/account/me")
    assert refreshed.json()["balance_cents"] == 0


def test_newapi_topup_rejects_bad_signature(newapi_topup_client: TestClient) -> None:
    payload, _ = _signed_payload()

    response = newapi_topup_client.get(
        "/api/v1/newapi/topups/start",
        params={"payload": payload, "sig": "bad"},
    )

    assert response.status_code == 401
    assert "签名无效" in response.json()["detail"]


def test_newapi_topup_payment_config_error_returns_503(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "newapi-topup-prod.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_INTENT_SECRET", "intent-secret")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_RECEIPT_TOKEN", "receipt-token")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_DEV_MODE", "false")
    monkeypatch.setenv("METAVIEW_WECHAT_PAY_APPID", "wx-app")
    monkeypatch.setenv("METAVIEW_WECHAT_PAY_MCHID", "mch")
    monkeypatch.setenv("METAVIEW_WECHAT_PAY_MERCHANT_SERIAL_NO", "serial")
    monkeypatch.setenv("METAVIEW_WECHAT_PAY_NOTIFY_URL", "https://metaview.top/api/v1/billing/wechat/notify")
    monkeypatch.setenv("METAVIEW_WECHAT_PAY_API_V3_KEY", "x" * 32)
    monkeypatch.setenv("METAVIEW_WECHAT_PAY_PRIVATE_KEY_PATH", str(tmp_path / "missing.pem"))
    monkeypatch.setenv("METAVIEW_WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH", str(tmp_path / "pub.pem"))
    app = create_app()
    with TestClient(app) as client:
        response = _start_topup(client)
    get_settings.cache_clear()

    assert response.status_code == 503
    assert "微信支付暂不可用" in response.json()["detail"]


def test_newapi_topup_real_payment_redirects_with_verifiable_receipt(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "newapi-topup-real.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_INTENT_SECRET", "intent-secret")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_RECEIPT_TOKEN", "receipt-token")
    monkeypatch.setenv("METAVIEW_NEWAPI_TOPUP_DEV_MODE", "false")
    payment = _FakePaymentGateway()
    app = create_app()
    app.dependency_overrides[get_payment_gateway] = lambda: payment

    with TestClient(app) as client:
        start = _start_topup(client)
        assert start.status_code == 200
        assert "已完成支付，返回 NewAPI" in start.text
        intent_id = _extract_intent_id(start.text)

        pending = client.get(
            f"/api/v1/newapi/topups/{intent_id}/complete",
            follow_redirects=False,
        )
        assert pending.status_code == 400
        assert "尚未支付" in pending.json()["detail"]

        payment.transaction = PaymentTransaction(
            order_id=intent_id,
            amount_cents=500,
            provider_order_id="wx_tx_newapi_1",
            trade_state="SUCCESS",
        )
        notified = client.post("/api/v1/billing/wechat/notify", content=b"{}")
        assert notified.status_code == 200
        assert notified.json() == {"code": "SUCCESS", "message": "success"}

        completed = client.get(
            f"/api/v1/newapi/topups/{intent_id}/complete",
            follow_redirects=False,
        )
        assert completed.status_code == 303
        query = parse_qs(urlparse(completed.headers["location"]).query)
        receipt_code = query["receipt_code"][0]
        assert query["state"] == ["state-1"]
        assert query["intent_id"] == [intent_id]
        assert receipt_code.startswith("mvr_")

        verified = client.post(
            "/api/v1/internal/newapi/topup-receipts/verify",
            headers={"Authorization": "Bearer receipt-token"},
            json={
                "intent_id": intent_id,
                "receipt_code": receipt_code,
                "newapi_user_id": 4,
                "state": "state-1",
            },
        )
        assert verified.status_code == 200
        assert verified.json()["status"] == "verified"

        duplicate_notify = client.post("/api/v1/billing/wechat/notify", content=b"{}")
        assert duplicate_notify.status_code == 200
        assert duplicate_notify.json() == {"code": "SUCCESS", "message": "success"}

    get_settings.cache_clear()


def test_newapi_topup_verify_requires_internal_token(
    newapi_topup_client: TestClient,
) -> None:
    start = _start_topup(newapi_topup_client)
    intent_id = _extract_intent_id(start.text)
    paid = newapi_topup_client.post(
        f"/api/v1/newapi/topups/{intent_id}/dev-pay",
        follow_redirects=False,
    )
    receipt_code = parse_qs(urlparse(paid.headers["location"]).query)["receipt_code"][0]

    response = newapi_topup_client.post(
        "/api/v1/internal/newapi/topup-receipts/verify",
        json={
            "intent_id": intent_id,
            "receipt_code": receipt_code,
            "newapi_user_id": 4,
            "state": "state-1",
        },
    )

    assert response.status_code == 401


def _start_topup(client: TestClient):
    payload, sig = _signed_payload()
    return client.get(
        "/api/v1/newapi/topups/start",
        params={"payload": payload, "sig": sig},
    )


def _signed_payload() -> tuple[str, str]:
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    return encode_signed_payload(
        "intent-secret",
        {
            "newapi_user_id": 4,
            "amount_cents": 500,
            "quota_delta": 2_500_000,
            "state": "state-1",
            "return_url": "http://localhost:3000/console/topup/metaview/callback",
            "expires_at": expires_at,
        },
    )


def _extract_intent_id(html: str) -> str:
    match = re.search(r"nup[0-9a-f]{29}", html)
    assert match is not None
    return match.group(0)


@dataclass
class _FakePaymentGateway:
    transaction: PaymentTransaction | None = None
    configured: bool = True

    async def create_native_order(
        self,
        *,
        order_id: str,
        amount_cents: int,
        description: str,
    ) -> NativePaymentOrder:
        return NativePaymentOrder(
            code_url=f"weixin://wxpay/{order_id}",
            provider_order_id=f"wx_pre_{order_id}",
        )

    def decode_notification(
        self,
        headers: dict[str, str],
        body: bytes,
    ) -> PaymentTransaction:
        if self.transaction is None:
            raise AssertionError("No fake payment transaction configured")
        return self.transaction
