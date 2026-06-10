from __future__ import annotations

import json
from urllib.parse import parse_qs, urlencode, urlparse

import pytest

from app.config import Settings
from app.infrastructure.payment.easy_pay import EasyPayClient, EasyPayGatewayError


def _settings() -> Settings:
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


@pytest.mark.asyncio
async def test_create_native_order_builds_submit_php_link_with_signature() -> None:
    client = EasyPayClient(_settings())
    order = await client.create_native_order(
        order_id="ord_001",
        amount_cents=500,
        description="MetaView 账户充值 5.00 元",
    )

    parsed = urlparse(order.code_url)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == "https://pay.example.com/submit.php"
    query = parse_qs(parsed.query)
    assert query["pid"] == ["merchant-id"]
    assert query["money"] == ["5.00"]
    assert query["type"] == ["wxpay"]
    assert query["return_url"] == ["https://metaview.top/payment/result"]
    assert query["sign_type"] == ["MD5"]


@pytest.mark.parametrize("raw_body_source", ["query", "form", "json"])
def test_decode_notification_supports_query_form_and_json(raw_body_source: str) -> None:
    client = EasyPayClient(_settings())
    payload = {
        "pid": "merchant-id",
        "out_trade_no": "ord_002",
        "trade_status": "TRADE_SUCCESS",
        "trade_no": "tx_002",
        "money": "5.00",
        "type": "wxpay",
    }
    payload["sign"] = client._sign(payload)

    if raw_body_source == "query":
        transaction = client.decode_notification({}, b"", query=payload)
    elif raw_body_source == "form":
        headers = {"content-type": "application/x-www-form-urlencoded"}
        body = urlencode(payload).encode("utf-8")
        transaction = client.decode_notification(headers, body)
    else:
        headers = {"content-type": "application/json"}
        body = json.dumps(payload).encode("utf-8")
        transaction = client.decode_notification(headers, body)

    assert transaction.order_id == "ord_002"
    assert transaction.amount_cents == 500
    assert transaction.provider_order_id == "tx_002"
    assert transaction.trade_state == "SUCCESS"


def test_sign_rule_excludes_sign_sign_type_and_sorts_keys() -> None:
    client = EasyPayClient(_settings())
    payload = {
        "b": "20",
        "a": "10",
        "sign": "old",
        "sign_type": "MD5",
        "empty": "",
        "zero": None,
        "pid": "merchant-id",
    }

    assert client._sign(payload) == "ab54af13d17a23080d61d79f13b38fa1"


def test_decode_notification_returns_payment_transaction_for_successful_payment() -> None:
    client = EasyPayClient(_settings())
    payload = {
        "pid": "merchant-id",
        "out_trade_no": "ord_001",
        "trade_status": "TRADE_SUCCESS",
        "trade_no": "tx_001",
        "money": "5.00",
        "type": "wxpay",
    }
    payload["sign"] = client._sign(payload)

    transaction = client.decode_notification(
        {},
        urlencode(payload).encode("utf-8"),
    )
    assert transaction.order_id == "ord_001"
    assert transaction.amount_cents == 500
    assert transaction.provider_order_id == "tx_001"
    assert transaction.trade_state == "SUCCESS"


def test_decode_notification_returns_non_success_trade_status() -> None:
    client = EasyPayClient(_settings())
    payload = {
        "pid": "merchant-id",
        "out_trade_no": "ord_not_paid",
        "trade_status": "TRADE_CLOSED",
        "trade_no": "tx_002",
        "money": "5.00",
        "type": "wxpay",
    }
    payload["sign"] = client._sign(payload)

    transaction = client.decode_notification({}, urlencode(payload).encode("utf-8"))
    assert transaction.order_id == "ord_not_paid"
    assert transaction.amount_cents == 0
    assert transaction.trade_state == "TRADE_CLOSED"


@pytest.mark.parametrize(
    ("money", "expect_message"),
    [
        ("abc", "amount invalid"),
        ("0", "amount invalid"),
        ("-5", "amount invalid"),
    ],
)
def test_decode_notification_rejects_amount_errors(money: str, expect_message: str) -> None:
    client = EasyPayClient(_settings())
    payload = {
        "pid": "merchant-id",
        "out_trade_no": "ord_bad_amount",
        "trade_status": "TRADE_SUCCESS",
        "trade_no": "tx_bad",
        "money": money,
        "type": "wxpay",
    }
    payload["sign"] = client._sign(payload)

    with pytest.raises(EasyPayGatewayError, match=expect_message):
        client.decode_notification({}, urlencode(payload).encode("utf-8"))


def test_decode_notification_rejects_pid_mismatch() -> None:
    client = EasyPayClient(_settings())
    payload = {
        "pid": "other-merchant",
        "out_trade_no": "ord_pid_mismatch",
        "trade_status": "TRADE_SUCCESS",
        "trade_no": "tx_bad",
        "money": "5.00",
        "type": "wxpay",
    }
    payload["sign"] = client._sign(payload)

    with pytest.raises(EasyPayGatewayError, match="pid mismatch"):
        client.decode_notification({}, urlencode(payload).encode("utf-8"))


def test_decode_notification_rejects_signature_error() -> None:
    client = EasyPayClient(_settings())
    payload = {
        "pid": "merchant-id",
        "out_trade_no": "ord_sig_bad",
        "trade_status": "TRADE_SUCCESS",
        "trade_no": "tx_bad",
        "money": "5.00",
        "type": "wxpay",
    }
    payload["sign"] = "bad"

    with pytest.raises(EasyPayGatewayError, match="signature invalid"):
        client.decode_notification({}, urlencode(payload).encode("utf-8"))
