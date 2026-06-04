from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode, urlparse

from app.application.ports.newapi_topup_repository import INewApiTopupRepository
from app.application.ports.payment_gateway import IPaymentGateway
from app.config import Settings
from app.domain.models.account import money_from_cents
from app.domain.models.newapi_topup import NewApiTopupIntent


class NewApiTopupError(RuntimeError):
    pass


class NewApiTopupNotConfiguredError(NewApiTopupError):
    pass


class NewApiTopupSignatureError(NewApiTopupError):
    pass


class NewApiTopupValidationError(NewApiTopupError):
    pass


class NewApiTopupPaymentError(NewApiTopupError):
    pass


class NewApiTopupOrderNotFoundError(NewApiTopupError):
    pass


class NewApiTopupReceiptError(NewApiTopupError):
    pass


@dataclass(frozen=True)
class NewApiTopupCheckout:
    intent: NewApiTopupIntent
    dev_mode: bool


@dataclass(frozen=True)
class NewApiTopupPaid:
    intent: NewApiTopupIntent
    receipt_code: str
    redirect_url: str


@dataclass(frozen=True)
class NewApiTopupReceiptVerification:
    intent: NewApiTopupIntent
    status: str


class NewApiTopupUseCase:
    def __init__(
        self,
        *,
        settings: Settings,
        repo: INewApiTopupRepository,
        payment: IPaymentGateway,
    ) -> None:
        self._settings = settings
        self._repo = repo
        self._payment = payment

    @property
    def configured(self) -> bool:
        return bool(self._settings.newapi_topup_intent_secret)

    async def start_from_signed_payload(
        self,
        *,
        payload: str,
        sig: str,
    ) -> NewApiTopupCheckout:
        body = self._decode_verified_payload(payload=payload, sig=sig)
        intent_id = f"nup{uuid.uuid4().hex[:29]}"
        created_at = _iso_now()
        expires_at = _require_str(body, "expires_at")
        amount_cents = _require_int(body, "amount_cents")
        quota_delta = _require_int(body, "quota_delta")
        newapi_user_id = _require_int(body, "newapi_user_id")
        state = _require_str(body, "state")
        return_url = _require_str(body, "return_url")

        self._validate_intent(
            amount_cents=amount_cents,
            quota_delta=quota_delta,
            newapi_user_id=newapi_user_id,
            state=state,
            return_url=return_url,
            expires_at=expires_at,
        )
        intent = await self._repo.create_intent(
            intent_id=intent_id,
            order_id=intent_id,
            newapi_user_id=newapi_user_id,
            amount_cents=amount_cents,
            quota_delta=quota_delta,
            state=state,
            return_url=return_url,
            expires_at=expires_at,
            created_at=created_at,
        )
        if not self._settings.newapi_topup_dev_mode:
            if not self._payment.configured:
                raise NewApiTopupPaymentError("微信支付未配置，暂时不能充值")
            native = await self._payment.create_native_order(
                order_id=intent.order_id,
                amount_cents=intent.amount_cents,
                description=f"NewAPI 额度充值 {money_from_cents(intent.amount_cents)} 元",
            )
            updated = await self._repo.attach_payment_info(
                intent.intent_id,
                code_url=native.code_url,
                provider_order_id=native.provider_order_id,
            )
            if updated is None:
                raise NewApiTopupPaymentError("NewAPI 充值单创建后丢失")
            intent = updated
        return NewApiTopupCheckout(intent=intent, dev_mode=self._settings.newapi_topup_dev_mode)

    async def dev_mark_paid(self, intent_id: str) -> NewApiTopupPaid:
        if not self._settings.newapi_topup_dev_mode:
            raise NewApiTopupPaymentError("NewAPI 开发模式模拟支付未启用")
        intent = await self._repo.get_intent(intent_id)
        if intent is None:
            raise NewApiTopupOrderNotFoundError("NewAPI 充值单不存在")
        if _parse_datetime(intent.expires_at) <= _now():
            raise NewApiTopupValidationError("NewAPI 充值单已过期")
        if intent.status != "pending":
            raise NewApiTopupReceiptError("充值单已支付，receipt_code 不会重复展示")

        receipt_code = f"mvr_{secrets.token_urlsafe(24)}"
        paid = await self._repo.mark_paid(
            order_id=intent.order_id,
            amount_cents=intent.amount_cents,
            provider_order_id=f"dev_{intent.order_id}",
            paid_at=_iso_now(),
            receipt_code_hash=_hash_receipt(receipt_code),
        )
        if paid is None or paid.status != "paid":
            raise NewApiTopupPaymentError("NewAPI 开发模式模拟支付失败")
        return NewApiTopupPaid(
            intent=paid,
            receipt_code=receipt_code,
            redirect_url=_build_return_url(paid, receipt_code),
        )

    async def handle_payment_notification(
        self,
        headers: dict[str, str],
        body: bytes,
    ) -> str:
        transaction = self._payment.decode_notification(headers, body)
        if transaction.trade_state != "SUCCESS":
            return "ignored"
        intent = await self._repo.get_intent_by_order_id(transaction.order_id)
        if intent is None:
            raise NewApiTopupOrderNotFoundError("NewAPI 充值单不存在")
        if intent.status == "paid":
            return "success"
        receipt_code = f"mvr_{secrets.token_urlsafe(24)}"
        paid = await self._repo.mark_paid(
            order_id=transaction.order_id,
            amount_cents=transaction.amount_cents,
            provider_order_id=transaction.provider_order_id,
            paid_at=_iso_now(),
            receipt_code_hash=_hash_receipt(receipt_code),
        )
        if paid is None or paid.status != "paid":
            raise NewApiTopupPaymentError("微信支付回调金额或订单状态不匹配")
        return "success"

    async def verify_receipt(
        self,
        *,
        intent_id: str,
        receipt_code: str,
        newapi_user_id: int,
        state: str,
    ) -> NewApiTopupReceiptVerification:
        intent = await self._repo.get_intent(intent_id)
        if intent is None:
            raise NewApiTopupOrderNotFoundError("NewAPI receipt 不存在")
        if intent.newapi_user_id != newapi_user_id or intent.state != state:
            raise NewApiTopupReceiptError("NewAPI receipt 与用户或 state 不匹配")
        if intent.status not in {"paid", "verified", "acked"}:
            raise NewApiTopupReceiptError("NewAPI receipt 尚未支付")
        if intent.receipt_code_hash != _hash_receipt(receipt_code):
            raise NewApiTopupReceiptError("NewAPI receipt_code 无效")
        if intent.status == "paid":
            updated = await self._repo.mark_verified(
                intent_id=intent.intent_id,
                verified_at=_iso_now(),
            )
            if updated is None:
                raise NewApiTopupReceiptError("NewAPI receipt 验证失败")
            intent = updated
        return NewApiTopupReceiptVerification(intent=intent, status=intent.status)

    async def ack_receipt(
        self,
        *,
        intent_id: str,
        newapi_user_id: int,
        state: str,
    ) -> NewApiTopupIntent:
        intent = await self._repo.get_intent(intent_id)
        if intent is None:
            raise NewApiTopupOrderNotFoundError("NewAPI receipt 不存在")
        if intent.newapi_user_id != newapi_user_id or intent.state != state:
            raise NewApiTopupReceiptError("NewAPI receipt 与用户或 state 不匹配")
        if intent.status not in {"verified", "acked"}:
            raise NewApiTopupReceiptError("NewAPI receipt 尚未验证")
        if intent.status == "acked":
            return intent
        updated = await self._repo.mark_acked(intent_id=intent.intent_id, acked_at=_iso_now())
        if updated is None:
            raise NewApiTopupReceiptError("NewAPI receipt ack 失败")
        return updated

    def _decode_verified_payload(self, *, payload: str, sig: str) -> dict[str, Any]:
        secret = self._settings.newapi_topup_intent_secret
        if not secret:
            raise NewApiTopupNotConfiguredError("NewAPI 充值跳转密钥未配置")
        expected = _sign_payload(secret, payload)
        if not hmac.compare_digest(sig, expected):
            raise NewApiTopupSignatureError("NewAPI 充值跳转签名无效")
        try:
            raw = _b64url_decode(payload)
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            raise NewApiTopupValidationError("NewAPI 充值跳转 payload 格式不正确") from exc
        if not isinstance(decoded, dict):
            raise NewApiTopupValidationError("NewAPI 充值跳转 payload 必须是对象")
        return decoded

    def _validate_intent(
        self,
        *,
        amount_cents: int,
        quota_delta: int,
        newapi_user_id: int,
        state: str,
        return_url: str,
        expires_at: str,
    ) -> None:
        if amount_cents <= 0:
            raise NewApiTopupValidationError("充值金额必须大于 0")
        if newapi_user_id <= 0:
            raise NewApiTopupValidationError("NewAPI user_id 无效")
        if not state:
            raise NewApiTopupValidationError("NewAPI state 不能为空")
        expected_quota = amount_cents * self._settings.newapi_quota_per_yuan // 100
        if quota_delta != expected_quota:
            raise NewApiTopupValidationError("NewAPI quota_delta 与金额不匹配")
        if _parse_datetime(expires_at) <= _now():
            raise NewApiTopupValidationError("NewAPI 充值跳转已过期")
        _validate_return_url(
            return_url,
            allowed_origins=self._settings.newapi_topup_allowed_return_origins,
        )


def encode_signed_payload(secret: str, payload: dict[str, Any]) -> tuple[str, str]:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    body = _b64url_encode(raw)
    return body, _sign_payload(secret, body)


def _sign_payload(secret: str, payload: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = value + ("=" * (-len(value) % 4))
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _require_int(body: dict[str, Any], key: str) -> int:
    value = body.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise NewApiTopupValidationError(f"NewAPI payload 缺少整数字段 {key}")
    return value


def _require_str(body: dict[str, Any], key: str) -> str:
    value = body.get(key)
    if not isinstance(value, str) or not value:
        raise NewApiTopupValidationError(f"NewAPI payload 缺少字符串字段 {key}")
    return value


def _parse_datetime(value: str) -> datetime:
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise NewApiTopupValidationError("时间格式不正确") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat()


def _hash_receipt(receipt_code: str) -> str:
    return hashlib.sha256(receipt_code.encode("utf-8")).hexdigest()


def _validate_return_url(return_url: str, *, allowed_origins: str) -> None:
    parsed = urlparse(return_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise NewApiTopupValidationError("NewAPI return_url 无效")
    origin = f"{parsed.scheme}://{parsed.netloc}"
    allowed = {item.strip().rstrip("/") for item in allowed_origins.split(",") if item.strip()}
    if origin not in allowed:
        raise NewApiTopupValidationError("NewAPI return_url 不在白名单")


def _build_return_url(intent: NewApiTopupIntent, receipt_code: str) -> str:
    separator = "&" if "?" in intent.return_url else "?"
    return (
        intent.return_url
        + separator
        + urlencode(
            {
                "state": intent.state,
                "intent_id": intent.intent_id,
                "receipt_code": receipt_code,
            }
        )
    )

