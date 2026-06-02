from __future__ import annotations

from typing import Protocol

from app.domain.models.account import OAuthIdentity, RechargeOrder, SessionAccount


class IAccountRepository(Protocol):
    async def get_or_create_session(
        self,
        token: str | None,
        *,
        session_days: int,
    ) -> SessionAccount: ...

    async def clear_session(self, token: str | None) -> None: ...

    async def save_oauth_state(
        self,
        state: str,
        token_hash: str | None,
        *,
        ttl_minutes: int = 10,
    ) -> None: ...

    async def consume_oauth_state(self, state: str) -> str | None: ...

    async def link_oauth_account(
        self,
        *,
        current_token_hash: str | None,
        identity: OAuthIdentity,
        session_days: int,
    ) -> SessionAccount: ...

    async def create_recharge_order(
        self,
        user_id: str,
        amount_cents: int,
        *,
        channel: str,
    ) -> RechargeOrder: ...

    async def attach_order_payment_info(
        self,
        order_id: str,
        *,
        code_url: str,
        provider_order_id: str | None,
    ) -> RechargeOrder | None: ...

    async def get_order(
        self,
        order_id: str,
        user_id: str | None = None,
    ) -> RechargeOrder | None: ...

    async def list_orders(self, user_id: str, limit: int = 20) -> list[RechargeOrder]: ...

    async def mark_order_paid(
        self,
        *,
        order_id: str,
        amount_cents: int,
        provider_order_id: str,
        paid_at: str,
    ) -> RechargeOrder | None: ...
