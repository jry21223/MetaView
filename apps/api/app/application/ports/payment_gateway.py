from __future__ import annotations

from typing import Protocol

from app.domain.models.account import NativePaymentOrder, PaymentTransaction


class IPaymentGateway(Protocol):
    @property
    def configured(self) -> bool: ...

    async def create_native_order(
        self,
        *,
        order_id: str,
        amount_cents: int,
        description: str,
    ) -> NativePaymentOrder: ...

    def decode_notification(
        self,
        headers: dict[str, str],
        body: bytes,
        *,
        query: dict[str, str] | None = None,
    ) -> PaymentTransaction: ...
