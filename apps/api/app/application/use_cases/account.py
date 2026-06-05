from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from app.application.ports.account_repository import IAccountRepository
from app.application.ports.oauth_client import IOAuthClient
from app.application.ports.payment_gateway import IPaymentGateway
from app.config import Settings
from app.domain.models.account import (
    PaymentTransaction,
    RechargeOrder,
    SessionAccount,
    amount_to_cents,
    money_from_cents,
)


class AccountUseCaseError(RuntimeError):
    pass


class AmountValidationError(AccountUseCaseError):
    pass


class PaymentNotConfiguredError(AccountUseCaseError):
    pass


class OAuthNotConfiguredError(AccountUseCaseError):
    pass


class OAuthStateError(AccountUseCaseError):
    pass


class OrderNotFoundError(AccountUseCaseError):
    pass


class PaymentNotificationError(AccountUseCaseError):
    pass


class InsufficientBalanceError(AccountUseCaseError):
    pass


class PaymentOrderNotFoundError(PaymentNotificationError):
    pass


@dataclass(frozen=True)
class WeChatLoginStart:
    session: SessionAccount
    url: str
    state: str


class AccountUseCase:
    def __init__(
        self,
        *,
        settings: Settings,
        repo: IAccountRepository,
        payment: IPaymentGateway,
        oauth: IOAuthClient,
    ) -> None:
        self._settings = settings
        self._repo = repo
        self._payment = payment
        self._oauth = oauth

    @property
    def payment_enabled(self) -> bool:
        return self._payment.configured

    @property
    def wechat_login_enabled(self) -> bool:
        return self._oauth.configured

    async def get_or_create_session(self, token: str | None) -> SessionAccount:
        return await self._repo.get_or_create_session(
            token,
            session_days=self._settings.account_session_days,
        )

    async def consume_generation_credit(
        self,
        *,
        session: SessionAccount,
        ledger_id: str,
    ) -> None:
        cost_cents = self._settings.generation_cost_cents
        if cost_cents <= 0:
            return
        consumed = await self._repo.consume_balance(
            user_id=session.account.user_id,
            amount_cents=cost_cents,
            ledger_id=ledger_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        if not consumed:
            raise InsufficientBalanceError(
                f"账户余额不足，本次需要 {money_from_cents(cost_cents)} 元"
            )

    async def refund_generation_credit(
        self,
        *,
        session: SessionAccount,
        ledger_id: str,
    ) -> bool:
        cost_cents = self._settings.generation_cost_cents
        if cost_cents <= 0:
            return True
        return await self._repo.refund_balance(
            user_id=session.account.user_id,
            amount_cents=cost_cents,
            consume_ledger_id=ledger_id,
            refund_ledger_id=f"refund:{ledger_id}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    async def logout(self, token: str | None) -> None:
        await self._repo.clear_session(token)

    async def begin_wechat_login(self, token: str | None) -> WeChatLoginStart:
        if not self._oauth.configured:
            raise OAuthNotConfiguredError("微信登录未配置")
        session = await self.get_or_create_session(token)
        state = secrets.token_urlsafe(18)
        await self._repo.save_oauth_state(state, session.token_hash)
        return WeChatLoginStart(
            session=session,
            url=self._oauth.build_login_url(state),
            state=state,
        )

    async def complete_wechat_login(self, *, code: str, state: str) -> SessionAccount:
        if not self._oauth.configured:
            raise OAuthNotConfiguredError("微信登录未配置")
        token_hash = await self._repo.consume_oauth_state(state)
        if token_hash is None:
            raise OAuthStateError("微信登录 state 已过期")
        identity = await self._oauth.fetch_identity(code)
        return await self._repo.link_oauth_account(
            current_token_hash=token_hash,
            identity=identity,
            session_days=self._settings.account_session_days,
        )

    async def list_recharge_orders(
        self,
        token: str | None,
    ) -> tuple[SessionAccount, list[RechargeOrder]]:
        session = await self.get_or_create_session(token)
        return session, await self._repo.list_orders(session.account.user_id)

    async def create_recharge_order(
        self,
        token: str | None,
        amount_yuan: Decimal,
    ) -> tuple[SessionAccount, RechargeOrder]:
        try:
            amount_cents = amount_to_cents(amount_yuan, self._settings.recharge_min_cents)
        except ValueError as exc:
            raise AmountValidationError(str(exc)) from exc
        if not self._payment.configured:
            raise PaymentNotConfiguredError("微信支付未配置，暂时不能充值")

        session = await self.get_or_create_session(token)
        order = await self._repo.create_recharge_order(
            session.account.user_id,
            amount_cents,
            channel="wechat_native",
        )
        try:
            native = await self._payment.create_native_order(
                order_id=order.order_id,
                amount_cents=order.amount_cents,
                description=f"MetaView 账户充值 {money_from_cents(order.amount_cents)} 元",
            )
        except RuntimeError as exc:
            raise PaymentNotConfiguredError("微信支付暂不可用，请稍后重试") from exc
        order = await self._repo.attach_order_payment_info(
            order.order_id,
            code_url=native.code_url,
            provider_order_id=native.provider_order_id,
        )
        assert order is not None
        return session, order

    async def get_recharge_order(
        self,
        token: str | None,
        order_id: str,
    ) -> tuple[SessionAccount, RechargeOrder]:
        session = await self.get_or_create_session(token)
        order = await self._repo.get_order(order_id, session.account.user_id)
        if order is None:
            raise OrderNotFoundError("订单不存在")
        return session, order

    async def handle_payment_notification(
        self,
        headers: dict[str, str],
        body: bytes,
    ) -> str:
        transaction = self._payment.decode_notification(headers, body)
        return await self.handle_payment_transaction(transaction)

    async def handle_payment_transaction(self, transaction: PaymentTransaction) -> str:
        if transaction.trade_state != "SUCCESS":
            return "ignored"
        paid_at = datetime.now(timezone.utc).isoformat()
        order = await self._repo.mark_order_paid(
            order_id=transaction.order_id,
            amount_cents=transaction.amount_cents,
            provider_order_id=transaction.provider_order_id,
            paid_at=paid_at,
        )
        if order is None:
            raise PaymentOrderNotFoundError("微信支付回调订单不存在")
        if order.status != "paid":
            raise PaymentNotificationError("微信支付回调金额或订单状态不匹配")
        return "success"
