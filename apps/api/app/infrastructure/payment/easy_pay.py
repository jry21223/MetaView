from __future__ import annotations

import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal
from hmac import compare_digest
from urllib.parse import parse_qs, urlencode

from app.config import Settings
from app.domain.models.account import NativePaymentOrder, PaymentTransaction


class EasyPayConfigError(RuntimeError):
    pass


class EasyPayGatewayError(RuntimeError):
    pass


class EasyPayClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def configured(self) -> bool:
        return bool(
            (self._settings.epay_api_base or "").strip()
            and (self._settings.epay_submit_path or "").strip()
            and (self._merchant_id or "").strip()
            and (self._api_key or "").strip()
            and (self._settings.epay_notify_url or "").strip()
            and (self._settings.epay_return_url or "").strip()
        )

    @property
    def _merchant_id(self) -> str | None:
        return self._settings.epay_pid or self._settings.epay_merchant_id

    @property
    def _api_key(self) -> str | None:
        return self._settings.epay_key or self._settings.epay_api_key

    @property
    def _sign_type(self) -> str:
        return (self._settings.epay_sign_type or "MD5").strip() or "MD5"

    @property
    def _configured_submit_url(self) -> str | None:
        base = (self._settings.epay_api_base or "").strip().rstrip("/")
        path = (self._settings.epay_submit_path or "").strip()
        if base and path:
            submit_path = path if path.startswith("/") else f"/{path}"
            return f"{base}{submit_path}"
        return self._settings.epay_submit_url

    async def create_native_order(
        self,
        *,
        order_id: str,
        amount_cents: int,
        description: str,
        return_url: str | None = None,
    ) -> NativePaymentOrder:
        if not self.configured:
            raise EasyPayConfigError("Epay is not configured")

        submit_url = self._configured_submit_url
        params = self._build_order_payload(
            order_id=order_id,
            amount_cents=amount_cents,
            description=description[:127],
            return_url=return_url,
        )
        if "?" in submit_url:
            code_url = f"{submit_url}&{urlencode(params)}"
        else:
            code_url = f"{submit_url}?{urlencode(params)}"
        return NativePaymentOrder(code_url=code_url)

    def decode_notification(
        self,
        headers: dict[str, str],
        body: bytes,
        *,
        query: dict[str, str] | None = None,
    ) -> PaymentTransaction:
        payload = self._parse_payload(body, headers, query=query)
        if not payload:
            raise EasyPayGatewayError("Epay notification payload missing")
        if self._merchant_id is not None and payload.get("pid") != self._merchant_id:
            raise EasyPayGatewayError("Epay notification pid mismatch")

        self._verify_signature(payload)

        order_id = payload.get("out_trade_no")
        if not order_id:
            raise EasyPayGatewayError("Epay notification missing out_trade_no")
        trade_state_raw = payload.get("trade_status") or payload.get("status") or ""
        provider_order_id = payload.get("trade_no") or payload.get("transaction_id") or ""

        if str(trade_state_raw).upper() != "TRADE_SUCCESS":
            return PaymentTransaction(
                order_id=order_id,
                amount_cents=0,
                provider_order_id=provider_order_id or "",
                trade_state=str(trade_state_raw),
            )

        amount_cents = self._parse_money(payload.get("money") or payload.get("total_fee"))
        if not provider_order_id:
            raise EasyPayGatewayError("Epay notification missing provider transaction id")
        return PaymentTransaction(
            order_id=order_id,
            amount_cents=amount_cents,
            provider_order_id=provider_order_id,
            trade_state="SUCCESS",
        )

    def _build_order_payload(
        self,
        *,
        order_id: str,
        amount_cents: int,
        description: str,
        return_url: str | None = None,
    ) -> dict[str, str]:
        submit_params = {
            "pid": self._merchant_id,
            "type": self._settings.epay_pay_type,
            "out_trade_no": order_id,
            "name": description,
            "money": self._format_money(amount_cents),
            "notify_url": self._settings.epay_notify_url,
            "return_url": return_url or self._settings.epay_return_url,
        }
        sign = self._sign(submit_params)
        submit_params["sign"] = sign
        submit_params["sign_type"] = self._sign_type
        return {k: str(v) for k, v in submit_params.items()}

    def _parse_payload(
        self,
        body: bytes,
        headers: dict[str, str],
        *,
        query: dict[str, str] | None = None,
    ) -> dict[str, str]:
        payload: dict[str, str] = {}
        if query:
            payload.update({str(k): str(v) for k, v in query.items() if v is not None and v != ""})
        if not body:
            return payload

        text = body.decode("utf-8")
        if not text:
            return payload

        content_type = (headers.get("content-type") or headers.get("Content-Type") or "").lower()
        if "application/json" in content_type:
            try:
                body_payload = json.loads(text)
            except json.JSONDecodeError as exc:
                raise EasyPayGatewayError("Epay notification body is not valid JSON") from exc
            if not isinstance(body_payload, dict):
                raise EasyPayGatewayError("Epay notification JSON shape invalid")
            payload.update({k: str(v) for k, v in body_payload.items() if v is not None})
            return payload

        parsed = parse_qs(text, keep_blank_values=True)
        payload.update({k: str(v[-1]) for k, v in parsed.items() if v})
        return payload

    def _verify_signature(self, payload: dict[str, str]) -> None:
        sign = payload.get("sign")
        if not sign:
            raise EasyPayGatewayError("Epay notification missing signature")

        source = payload.copy()
        source.pop("sign", None)
        source.pop("sign_type", None)
        expected = self._sign(source)
        if not compare_digest(sign.lower(), expected):
            raise EasyPayGatewayError("Epay notification signature invalid")

    def _sign(self, payload: dict[str, str | None]) -> str:
        data = {k: str(v) for k, v in payload.items() if v not in ("", None)}
        sorted_items = sorted((k, v) for k, v in data.items() if k not in {"sign", "sign_type"})
        message = "&".join(f"{key}={value}" for key, value in sorted_items)
        assert self._api_key is not None
        digest = hashlib.md5(f"{message}{self._api_key}".encode("utf-8")).hexdigest()
        return digest.lower()

    def _parse_money(self, value: str | None) -> int:
        if value is None:
            raise EasyPayGatewayError("Epay notification amount missing")
        try:
            amount = Decimal(value)
            if amount <= 0:
                raise EasyPayGatewayError("Epay notification amount invalid")
            return int((amount * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        except Exception as exc:
            raise EasyPayGatewayError("Epay notification amount invalid") from exc

    def _format_money(self, amount_cents: int) -> str:
        return f"{Decimal(amount_cents) / Decimal(100):.2f}"
