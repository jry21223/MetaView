from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

NewApiTopupStatus = Literal["pending", "paid", "verified", "acked", "expired"]


@dataclass(frozen=True)
class NewApiTopupIntent:
    intent_id: str
    order_id: str
    newapi_user_id: int
    amount_cents: int
    quota_delta: int
    state: str
    return_url: str
    status: str
    code_url: str | None
    provider_order_id: str | None
    receipt_code_hash: str | None
    created_at: str
    expires_at: str
    paid_at: str | None
    verified_at: str | None
    acked_at: str | None
