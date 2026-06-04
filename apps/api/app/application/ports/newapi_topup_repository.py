from __future__ import annotations

from typing import Protocol

from app.domain.models.newapi_topup import NewApiTopupIntent


class INewApiTopupRepository(Protocol):
    async def create_intent(
        self,
        *,
        intent_id: str,
        order_id: str,
        newapi_user_id: int,
        amount_cents: int,
        quota_delta: int,
        state: str,
        return_url: str,
        expires_at: str,
        created_at: str,
    ) -> NewApiTopupIntent: ...

    async def attach_payment_info(
        self,
        intent_id: str,
        *,
        code_url: str | None,
        provider_order_id: str | None,
    ) -> NewApiTopupIntent | None: ...

    async def get_intent(self, intent_id: str) -> NewApiTopupIntent | None: ...

    async def get_intent_by_order_id(self, order_id: str) -> NewApiTopupIntent | None: ...

    async def mark_paid(
        self,
        *,
        order_id: str,
        amount_cents: int,
        provider_order_id: str,
        paid_at: str,
        receipt_code_hash: str,
    ) -> NewApiTopupIntent | None: ...

    async def mark_verified(
        self,
        *,
        intent_id: str,
        verified_at: str,
    ) -> NewApiTopupIntent | None: ...

    async def mark_acked(
        self,
        *,
        intent_id: str,
        acked_at: str,
    ) -> NewApiTopupIntent | None: ...

