from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Literal

AppEdition = Literal["self", "ops"]
AccountRole = Literal["user", "admin"]
AccountStatus = Literal["enabled", "disabled"]
LoginProvider = Literal["guest", "wechat"]
RechargeStatus = Literal["pending", "paid", "closed"]
LedgerKind = Literal["recharge", "adjust", "refund", "consume"]


@dataclass(frozen=True)
class Account:
    user_id: str
    display_name: str
    avatar_url: str | None
    login_provider: str
    status: str
    role: str
    balance_cents: int
    wechat_openid: str | None
    wechat_unionid: str | None
    created_at: str | None = None
    last_login_at: str | None = None


@dataclass(frozen=True)
class SessionAccount:
    token: str
    token_hash: str
    account: Account


@dataclass(frozen=True)
class OAuthIdentity:
    provider: str
    provider_user_id: str
    union_id: str | None
    display_name: str | None
    avatar_url: str | None


@dataclass(frozen=True)
class RechargeOrder:
    order_id: str
    user_id: str
    amount_cents: int
    status: str
    channel: str
    provider_order_id: str | None
    code_url: str | None
    created_at: str
    paid_at: str | None


@dataclass(frozen=True)
class NativePaymentOrder:
    code_url: str
    provider_order_id: str | None = None


@dataclass(frozen=True)
class PaymentTransaction:
    order_id: str
    amount_cents: int
    provider_order_id: str
    trade_state: str


def money_from_cents(cents: int) -> str:
    return f"{Decimal(cents) / Decimal(100):.2f}"


def amount_to_cents(amount_yuan: Decimal, min_cents: int) -> int:
    try:
        cents = int((amount_yuan * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("充值金额格式不正确") from exc
    if cents < min_cents:
        raise ValueError(f"最低充值金额为 {money_from_cents(min_cents)} 元")
    return cents
