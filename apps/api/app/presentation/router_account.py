from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse, RedirectResponse
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.application.ports.payment_gateway import IPaymentGateway
from app.application.use_cases.account import (
    AccountUseCase,
    AmountValidationError,
    OAuthNotConfiguredError,
    OAuthStateError,
    OrderNotFoundError,
    PaymentNotConfiguredError,
    PaymentNotificationError,
    PaymentOrderNotFoundError,
)
from app.application.use_cases.newapi_topup import (
    NewApiTopupOrderNotFoundError,
    NewApiTopupPaymentError,
    NewApiTopupUseCase,
)
from app.config import Settings, get_settings
from app.domain.models.account import RechargeOrder, SessionAccount, money_from_cents
from app.presentation.dependencies import (
    get_account_use_case,
    get_newapi_topup_use_case,
    get_payment_gateway,
)
from app.presentation.rate_limit import read_limit, write_limit

router = APIRouter(tags=["account"])


class AccountMeResponse(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None = None
    login_provider: str
    status: str
    role: str
    balance_cents: int
    balance_yuan: str
    recharge_min_cents: int
    payment_enabled: bool
    wechat_login_enabled: bool


class WeChatLoginUrlResponse(BaseModel):
    url: str
    state: str


class RechargeOrderRequest(BaseModel):
    amount_yuan: Decimal = Field(gt=0)


class RechargeOrderResponse(BaseModel):
    order_id: str
    amount_cents: int
    amount_yuan: str
    status: str
    channel: str
    provider_order_id: str | None = None
    code_url: str | None = None
    created_at: str
    paid_at: str | None = None


def _set_session_cookie(response: Response, settings: Settings, session: SessionAccount) -> None:
    response.set_cookie(
        settings.account_session_cookie,
        session.token,
        max_age=settings.account_session_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.account_session_secure,
        samesite="lax",
    )


def _maybe_set_session_cookie(
    request: Request,
    response: Response,
    settings: Settings,
    session: SessionAccount,
) -> None:
    if request.cookies.get(settings.account_session_cookie) != session.token:
        _set_session_cookie(response, settings, session)


def _account_response(
    settings: Settings,
    use_case: AccountUseCase,
    session: SessionAccount,
) -> AccountMeResponse:
    account = session.account
    return AccountMeResponse(
        user_id=account.user_id,
        display_name=account.display_name,
        avatar_url=account.avatar_url,
        login_provider=account.login_provider,
        status=account.status,
        role=account.role,
        balance_cents=account.balance_cents,
        balance_yuan=money_from_cents(account.balance_cents),
        recharge_min_cents=settings.recharge_min_cents,
        payment_enabled=use_case.payment_enabled,
        wechat_login_enabled=use_case.wechat_login_enabled,
    )


def _order_response(order: RechargeOrder) -> RechargeOrderResponse:
    return RechargeOrderResponse(
        order_id=order.order_id,
        amount_cents=order.amount_cents,
        amount_yuan=money_from_cents(order.amount_cents),
        status=order.status,
        channel=order.channel,
        provider_order_id=order.provider_order_id,
        code_url=order.code_url,
        created_at=order.created_at,
        paid_at=order.paid_at,
    )


@router.get("/account/me", response_model=AccountMeResponse)
@read_limit()
async def get_me(
    request: Request,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> AccountMeResponse:
    session = await use_case.get_or_create_session(
        request.cookies.get(settings.account_session_cookie)
    )
    _maybe_set_session_cookie(request, response, settings, session)
    return _account_response(settings, use_case, session)


@router.post("/account/logout")
@write_limit()
async def logout(
    request: Request,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> dict[str, str]:
    await use_case.logout(request.cookies.get(settings.account_session_cookie))
    response.delete_cookie(settings.account_session_cookie)
    return {"status": "ok"}


@router.get("/auth/wechat/login-url", response_model=WeChatLoginUrlResponse)
@read_limit()
async def wechat_login_url(
    request: Request,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> WeChatLoginUrlResponse:
    try:
        result = await use_case.begin_wechat_login(
            request.cookies.get(settings.account_session_cookie)
        )
    except OAuthNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    _maybe_set_session_cookie(request, response, settings, result.session)
    return WeChatLoginUrlResponse(url=result.url, state=result.state)


@router.get("/auth/wechat/callback")
@read_limit()
async def wechat_callback(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> RedirectResponse:
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="微信登录回调缺少 code/state")
    try:
        session = await use_case.complete_wechat_login(code=code, state=state)
    except OAuthNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    response = RedirectResponse(settings.wechat_login_success_url)
    _set_session_cookie(response, settings, session)
    return response


@router.get("/account/recharge-orders", response_model=list[RechargeOrderResponse])
@read_limit()
async def list_recharge_orders(
    request: Request,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> list[RechargeOrderResponse]:
    session, orders = await use_case.list_recharge_orders(
        request.cookies.get(settings.account_session_cookie)
    )
    _maybe_set_session_cookie(request, response, settings, session)
    return [_order_response(order) for order in orders]


@router.post("/account/recharge-orders", response_model=RechargeOrderResponse, status_code=201)
@write_limit()
async def create_recharge_order(
    request: Request,
    response: Response,
    payload: RechargeOrderRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> RechargeOrderResponse:
    try:
        session, order = await use_case.create_recharge_order(
            request.cookies.get(settings.account_session_cookie),
            payload.amount_yuan,
        )
    except AmountValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PaymentNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    _maybe_set_session_cookie(request, response, settings, session)
    return _order_response(order)


@router.get("/account/recharge-orders/{order_id}", response_model=RechargeOrderResponse)
@read_limit()
async def get_recharge_order(
    request: Request,
    response: Response,
    order_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> RechargeOrderResponse:
    try:
        session, order = await use_case.get_recharge_order(
            request.cookies.get(settings.account_session_cookie),
            order_id,
        )
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _maybe_set_session_cookie(request, response, settings, session)
    return _order_response(order)


@router.api_route("/billing/epay/notify", methods=["GET", "POST"])
async def epay_notify(
    request: Request,
    payment: Annotated[IPaymentGateway, Depends(get_payment_gateway)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
    newapi_topup: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> PlainTextResponse:
    try:
        await _handle_payment_notification(request, payment, use_case, newapi_topup)
    except PaymentOrderNotFoundError:
        return PlainTextResponse("fail", status_code=400)
    except NewApiTopupOrderNotFoundError:
        return PlainTextResponse("fail", status_code=400)
    except PaymentNotificationError:
        return PlainTextResponse("fail", status_code=400)
    except NewApiTopupPaymentError:
        return PlainTextResponse("fail", status_code=400)
    except RuntimeError:
        return PlainTextResponse("fail", status_code=400)
    return PlainTextResponse("success")


@router.api_route("/billing/wechat/notify", methods=["GET", "POST"])
async def wechat_pay_notify(
    request: Request,
    payment: Annotated[IPaymentGateway, Depends(get_payment_gateway)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
    newapi_topup: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> PlainTextResponse:
    # Deprecated alias: historical callback path retained for backward compatibility only.
    # Actual callback processing uses the shared EasyPay-compatible handler.
    return await epay_notify(request, payment, use_case, newapi_topup)


async def _handle_payment_notification(
    request: Request,
    payment: Annotated[IPaymentGateway, Depends(get_payment_gateway)],
    use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
    newapi_topup: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> str:
    body = await request.body()
    query = dict(request.query_params)
    transaction = payment.decode_notification(
        dict(request.headers),
        body,
        query=query,
    )
    try:
        return await use_case.handle_payment_notification(dict(request.headers), body, query=query)
    except PaymentOrderNotFoundError:
        result = await newapi_topup.handle_payment_transaction(transaction)
        return result
