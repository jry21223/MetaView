from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

from app.application.use_cases.account import AccountUseCase, PaymentNotificationError
from app.config import Settings, get_settings
from app.domain.models.account import NativePaymentOrder, OAuthIdentity, PaymentTransaction
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_account_repository import SqliteAccountRepository
from app.infrastructure.payment.easy_pay import EasyPayClient
from app.main import create_app
from app.presentation.dependencies import get_payment_gateway


def test_app_edition_defaults_and_normalizes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("METAVIEW_APP_EDITION", raising=False)
    assert Settings(_env_file=None).app_edition == "self"
    assert Settings(app_edition="ops", _env_file=None).app_edition == "ops"
    assert Settings(app_edition="bad", _env_file=None).app_edition == "self"


@pytest.fixture
def account_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "account.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    with TestClient(app) as client:
        yield client
    get_settings.cache_clear()


def _epay_test_settings() -> Settings:
    return Settings(
        payment_gateway="easypay",
        epay_api_base="https://pay.example.com",
        epay_submit_path="/submit.php",
        epay_pid="merchant-id",
        epay_key="test-key",
        epay_notify_url="https://metaview.top/api/v1/billing/epay/notify",
        epay_return_url="https://metaview.top/payment/result",
        _env_file=None,
    )


def _make_epay_payload(
    order_id: str,
    *,
    amount_yuan: str,
    provider_order_id: str,
    success: bool = True,
) -> dict[str, str]:
    payload = {
        "pid": "merchant-id",
        "out_trade_no": order_id,
        "trade_status": "TRADE_SUCCESS" if success else "TRADE_CLOSED",
        "trade_no": provider_order_id,
        "money": amount_yuan,
        "type": "wxpay",
    }
    return payload


def _post_epay_callback(
    client: TestClient,
    method: str,
    payload: dict[str, str],
) -> object:
    if method == "query":
        return client.get("/api/v1/billing/epay/notify", params=payload)
    if method == "form":
        body = urlencode(payload).encode("utf-8")
        return client.post(
            "/api/v1/billing/epay/notify",
            content=body,
            headers={"content-type": "application/x-www-form-urlencoded"},
        )
    return client.post(
        "/api/v1/billing/epay/notify",
        json=payload,
    )


def _build_configured_epay_client() -> EasyPayClient:
    return EasyPayClient(_epay_test_settings())


def test_get_me_creates_guest_session(account_client: TestClient) -> None:
    response = account_client.get("/api/v1/account/me")

    assert response.status_code == 200
    data = response.json()
    assert data["login_provider"] == "guest"
    assert data["status"] == "enabled"
    assert data["role"] == "user"
    assert data["balance_cents"] == 0
    assert data["payment_enabled"] is False
    assert "mv_session=" in response.headers["set-cookie"]


def test_recharge_validates_minimum_before_payment_config(account_client: TestClient) -> None:
    too_small = account_client.post(
        "/api/v1/account/recharge-orders",
        json={"amount_yuan": "4.99"},
    )
    assert too_small.status_code == 422
    assert "最低充值金额" in too_small.json()["detail"]

    unconfigured = account_client.post(
        "/api/v1/account/recharge-orders",
        json={"amount_yuan": "5.00"},
    )
    assert unconfigured.status_code == 503
    assert "易支付未配置" in unconfigured.json()["detail"]


def test_recharge_payment_config_error_returns_503(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "account-payment.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_PAYMENT_GATEWAY", "easypay")
    monkeypatch.setenv("METAVIEW_EPAY_API_BASE", "https://pay.example.com")
    monkeypatch.setenv("METAVIEW_EPAY_SUBMIT_PATH", "/submit.php")
    monkeypatch.setenv("METAVIEW_EPAY_PID", "pid")
    monkeypatch.setenv("METAVIEW_EPAY_KEY", "secret")
    monkeypatch.setenv("METAVIEW_EPAY_NOTIFY_URL", "https://metaview.top/api/v1/billing/epay/notify")
    monkeypatch.setenv("METAVIEW_EPAY_RETURN_URL", "https://metaview.top/payment/result")
    app = create_app()
    app.dependency_overrides[get_payment_gateway] = lambda: _FailingPaymentGateway()
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/account/recharge-orders",
            json={"amount_yuan": "5.00"},
        )
    get_settings.cache_clear()

    assert response.status_code == 503
    assert "易支付暂不可用" in response.json()["detail"]


def test_list_recharge_orders_starts_empty(account_client: TestClient) -> None:
    response = account_client.get("/api/v1/account/recharge-orders")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_recharge_order_id_matches_wechat_pay_limits(tmp_path: Path) -> None:
    db = str(tmp_path / "order-id.db")
    init_db(db)
    repo = SqliteAccountRepository(db)
    session = await repo.get_or_create_session(None, session_days=30)

    order = await repo.create_recharge_order(
        session.account.user_id,
        500,
        channel="epay",
    )

    assert len(order.order_id) <= 32
    assert re.fullmatch(r"[0-9A-Za-z_-]+", order.order_id)


@pytest.mark.asyncio
async def test_wechat_binding_merges_guest_balance(tmp_path: Path) -> None:
    db = str(tmp_path / "merge.db")
    init_db(db)
    repo = SqliteAccountRepository(db)
    paying_guest = await repo.get_or_create_session(None, session_days=30)
    linked_guest = await repo.get_or_create_session(None, session_days=30)

    order = await repo.create_recharge_order(
        paying_guest.account.user_id,
        500,
        channel="epay",
    )
    await repo.mark_order_paid(
        order_id=order.order_id,
        amount_cents=500,
        provider_order_id="wx_tx_1",
        paid_at=datetime.now(timezone.utc).isoformat(),
    )

    identity = OAuthIdentity(
        provider="wechat",
        provider_user_id="openid-1",
        union_id="union-1",
        display_name="微信用户",
        avatar_url=None,
    )
    linked = await repo.link_oauth_account(
        current_token_hash=linked_guest.token_hash,
        identity=identity,
        session_days=30,
    )
    merged = await repo.link_oauth_account(
        current_token_hash=paying_guest.token_hash,
        identity=identity,
        session_days=30,
    )
    old_guest = await repo.get_or_create_session(paying_guest.token, session_days=30)

    assert merged.account.user_id == linked.account.user_id
    assert merged.account.login_provider == "wechat"
    assert merged.account.balance_cents == 500
    assert old_guest.account.balance_cents == 0


@dataclass
class _FakePaymentGateway:
    transaction: PaymentTransaction
    configured: bool = True

    async def create_native_order(
        self,
        *,
        order_id: str,
        amount_cents: int,
        description: str,
    ) -> NativePaymentOrder:
        return NativePaymentOrder(code_url=f"weixin://wxpay/{order_id}")

    def decode_notification(
        self,
        headers: dict[str, str],
        body: bytes,
        query: dict[str, str] | None = None,
    ) -> PaymentTransaction:
        return self.transaction


class _FailingPaymentGateway:
    configured = True

    async def create_native_order(
        self,
        *,
        order_id: str,
        amount_cents: int,
        description: str,
    ) -> NativePaymentOrder:
        raise RuntimeError("payment provider unavailable")

    def decode_notification(
        self,
        headers: dict[str, str],
        body: bytes,
        query: dict[str, str] | None = None,
    ) -> PaymentTransaction:
        raise AssertionError("notification should not happen in this test")


class _DisabledOAuthClient:
    configured = False

    def build_login_url(self, state: str) -> str:
        raise AssertionError("OAuth is disabled in this test")

    async def fetch_identity(self, code: str) -> OAuthIdentity:
        raise AssertionError("OAuth is disabled in this test")


@pytest.mark.asyncio
async def test_payment_notification_is_idempotent_and_checks_amount(tmp_path: Path) -> None:
    db = str(tmp_path / "notify.db")
    init_db(db)
    repo = SqliteAccountRepository(db)
    session = await repo.get_or_create_session(None, session_days=30)
    order = await repo.create_recharge_order(
        session.account.user_id,
        500,
        channel="epay",
    )
    payment = _FakePaymentGateway(
        PaymentTransaction(
            order_id=order.order_id,
            amount_cents=500,
            provider_order_id="wx_tx_1",
            trade_state="SUCCESS",
        )
    )
    use_case = AccountUseCase(
        settings=Settings(rate_limit_enabled=False),
        repo=repo,
        payment=payment,
        oauth=_DisabledOAuthClient(),
    )

    assert await use_case.handle_payment_notification({}, b"{}") == "success"
    assert await use_case.handle_payment_notification({}, b"{}") == "success"
    refreshed = await repo.get_or_create_session(session.token, session_days=30)
    assert refreshed.account.balance_cents == 500

    mismatch = await repo.create_recharge_order(
        session.account.user_id,
        500,
        channel="epay",
    )
    payment.transaction = PaymentTransaction(
        order_id=mismatch.order_id,
        amount_cents=700,
        provider_order_id="wx_tx_2",
        trade_state="SUCCESS",
    )
    with pytest.raises(PaymentNotificationError):
        await use_case.handle_payment_notification({}, b"{}")
    refreshed = await repo.get_or_create_session(session.token, session_days=30)
    assert refreshed.account.balance_cents == 500


@pytest.mark.parametrize("method", ["query", "form", "json"])
def test_epay_notify_route_supports_query_form_and_json_and_marks_order_paid(
    method: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "notify-method-route.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_payment_gateway] = lambda: _build_configured_epay_client()

    with TestClient(app) as client:
        create_resp = client.post("/api/v1/account/recharge-orders", json={"amount_yuan": "5.00"})
        assert create_resp.status_code == 201
        order_id = create_resp.json()["order_id"]

        payment = _build_configured_epay_client()
        payload = _make_epay_payload(order_id, amount_yuan="5.00", provider_order_id="tx_method")
        payload["sign"] = payment._sign(payload)
        response = _post_epay_callback(client, method, payload)
        assert response.status_code == 200
        assert response.text == "success"

        order = client.get(f"/api/v1/account/recharge-orders/{order_id}")
        assert order.status_code == 200
        assert order.json()["status"] == "paid"
        assert order.json()["provider_order_id"] == "tx_method"
        assert client.get("/api/v1/account/me").json()["balance_cents"] == 500


@pytest.mark.parametrize("method", ["query", "form", "json"])
def test_epay_notify_route_rejects_amount_mismatch(
    method: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "notify-mismatch.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_payment_gateway] = lambda: _build_configured_epay_client()

    with TestClient(app) as client:
        create_resp = client.post("/api/v1/account/recharge-orders", json={"amount_yuan": "5.00"})
        assert create_resp.status_code == 201
        order_id = create_resp.json()["order_id"]

        payment = _build_configured_epay_client()
        payload = _make_epay_payload(order_id, amount_yuan="7.00", provider_order_id="tx_mismatch")
        payload["sign"] = payment._sign(payload)
        response = _post_epay_callback(client, method, payload)
        assert response.status_code == 400
        assert response.text == "fail"

        order = client.get(f"/api/v1/account/recharge-orders/{order_id}")
        assert order.status_code == 200
        assert order.json()["status"] == "pending"
        assert client.get("/api/v1/account/me").json()["balance_cents"] == 0


def test_epay_notify_route_rejects_bad_signature(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "notify-bad-sig.db"))
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_payment_gateway] = lambda: _build_configured_epay_client()

    with TestClient(app) as client:
        create_resp = client.post("/api/v1/account/recharge-orders", json={"amount_yuan": "5.00"})
        assert create_resp.status_code == 201
        order_id = create_resp.json()["order_id"]

        payload = _make_epay_payload(order_id, amount_yuan="5.00", provider_order_id="tx_bad_sig")
        payload["sign"] = "bad"
        response = _post_epay_callback(client, "query", payload)
        assert response.status_code == 400
        assert response.text == "fail"

        order = client.get(f"/api/v1/account/recharge-orders/{order_id}")
        assert order.status_code == 200
        assert order.json()["status"] == "pending"
        assert client.get("/api/v1/account/me").json()["balance_cents"] == 0


@pytest.mark.asyncio
async def test_epay_notify_route_returns_plain_text_and_rejects_non_success(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = str(tmp_path / "notify-route.db")
    init_db(db)
    repo = SqliteAccountRepository(db)
    session = await repo.get_or_create_session(None, session_days=30)
    order = await repo.create_recharge_order(
        session.account.user_id,
        500,
        channel="epay",
    )

    payment = _FakePaymentGateway(
        PaymentTransaction(
            order_id=order.order_id,
            amount_cents=500,
            provider_order_id="tx_route",
            trade_state="SUCCESS",
        )
    )

    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_payment_gateway] = lambda: payment
    with TestClient(app) as client:
        assert client.post("/api/v1/billing/epay/notify", content=b"{}").text == "success"
        response = client.get("/api/v1/billing/wechat/notify")
        assert response.status_code == 200
        assert response.text == "success"

        payment.transaction = PaymentTransaction(
            order_id=order.order_id,
            amount_cents=500,
            provider_order_id="tx_route",
            trade_state="CLOSED",
        )
        failed = client.post("/api/v1/billing/epay/notify", content=b"{}")
        assert failed.status_code == 400
        assert failed.text == "fail"
    get_settings.cache_clear()
