from __future__ import annotations

import hmac
from html import escape
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.application.use_cases.newapi_topup import (
    NewApiTopupNotConfiguredError,
    NewApiTopupOrderNotFoundError,
    NewApiTopupPaymentError,
    NewApiTopupReceiptError,
    NewApiTopupSignatureError,
    NewApiTopupUseCase,
    NewApiTopupValidationError,
)
from app.config import Settings, get_settings
from app.domain.models.account import money_from_cents
from app.domain.models.newapi_topup import NewApiTopupIntent
from app.presentation.dependencies import get_newapi_topup_use_case
from app.presentation.rate_limit import read_limit, write_limit

router = APIRouter(tags=["newapi-topup"])


class ReceiptVerifyRequest(BaseModel):
    intent_id: str = Field(min_length=1)
    receipt_code: str = Field(min_length=1)
    newapi_user_id: int = Field(gt=0)
    state: str = Field(min_length=1)


class ReceiptVerifyResponse(BaseModel):
    status: str
    intent_id: str
    order_id: str
    newapi_user_id: int
    amount_cents: int
    amount_yuan: str
    quota_delta: int
    paid_at: str


class ReceiptAckRequest(BaseModel):
    intent_id: str = Field(min_length=1)
    newapi_user_id: int = Field(gt=0)
    state: str = Field(min_length=1)


class ReceiptAckResponse(BaseModel):
    status: str
    intent_id: str
    acked_at: str | None


@router.get("/newapi/topups/start", response_class=HTMLResponse)
@read_limit()
async def start_newapi_topup(
    request: Request,
    payload: str,
    sig: str,
    use_case: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> HTMLResponse:
    try:
        checkout = await use_case.start_from_signed_payload(payload=payload, sig=sig)
    except NewApiTopupNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except NewApiTopupSignatureError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except NewApiTopupValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NewApiTopupPaymentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return HTMLResponse(_checkout_html(request, checkout.intent, checkout.dev_mode))


@router.post("/newapi/topups/{intent_id}/dev-pay")
@write_limit()
async def dev_pay_newapi_topup(
    request: Request,
    intent_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> RedirectResponse:
    if not settings.newapi_topup_dev_mode:
        raise HTTPException(status_code=404, detail="NewAPI 开发模式模拟支付未启用")
    if not _is_local_client(request):
        raise HTTPException(status_code=403, detail="NewAPI 开发模式支付只允许本机调用")
    try:
        paid = await use_case.dev_mark_paid(intent_id)
    except NewApiTopupOrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NewApiTopupPaymentError, NewApiTopupReceiptError, NewApiTopupValidationError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RedirectResponse(paid.redirect_url, status_code=303)


@router.get("/newapi/topups/{intent_id}/complete")
@read_limit()
async def complete_newapi_topup(
    request: Request,
    intent_id: str,
    use_case: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> RedirectResponse:
    try:
        paid = await use_case.complete_paid_redirect(intent_id)
    except NewApiTopupOrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (NewApiTopupNotConfiguredError, NewApiTopupReceiptError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RedirectResponse(paid.redirect_url, status_code=303)


@router.post(
    "/internal/newapi/topup-receipts/verify",
    response_model=ReceiptVerifyResponse,
)
@write_limit()
async def verify_newapi_topup_receipt(
    request: Request,
    payload: ReceiptVerifyRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> ReceiptVerifyResponse:
    _require_receipt_auth(request, settings)
    try:
        verification = await use_case.verify_receipt(
            intent_id=payload.intent_id,
            receipt_code=payload.receipt_code,
            newapi_user_id=payload.newapi_user_id,
            state=payload.state,
        )
    except NewApiTopupOrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NewApiTopupReceiptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    intent = verification.intent
    if intent.paid_at is None:
        raise HTTPException(status_code=400, detail="NewAPI receipt 尚未支付")
    return ReceiptVerifyResponse(
        status=verification.status,
        intent_id=intent.intent_id,
        order_id=intent.order_id,
        newapi_user_id=intent.newapi_user_id,
        amount_cents=intent.amount_cents,
        amount_yuan=money_from_cents(intent.amount_cents),
        quota_delta=intent.quota_delta,
        paid_at=intent.paid_at,
    )


@router.post("/internal/newapi/topup-receipts/ack", response_model=ReceiptAckResponse)
@write_limit()
async def ack_newapi_topup_receipt(
    request: Request,
    payload: ReceiptAckRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    use_case: Annotated[NewApiTopupUseCase, Depends(get_newapi_topup_use_case)],
) -> ReceiptAckResponse:
    _require_receipt_auth(request, settings)
    try:
        intent = await use_case.ack_receipt(
            intent_id=payload.intent_id,
            newapi_user_id=payload.newapi_user_id,
            state=payload.state,
        )
    except NewApiTopupOrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NewApiTopupReceiptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ReceiptAckResponse(
        status=intent.status,
        intent_id=intent.intent_id,
        acked_at=intent.acked_at,
    )


def _require_receipt_auth(request: Request, settings: Settings) -> None:
    token = settings.newapi_topup_receipt_token
    if not token:
        raise HTTPException(status_code=503, detail="NewAPI receipt token 未配置")
    authorization = request.headers.get("Authorization", "")
    expected = f"Bearer {token}"
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="NewAPI receipt token 无效")


def _is_local_client(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in {"127.0.0.1", "::1", "localhost", "testclient"}


def _checkout_html(request: Request, intent: NewApiTopupIntent, dev_mode: bool) -> str:
    amount = money_from_cents(intent.amount_cents)
    quota = f"{intent.quota_delta:,}"
    dev_action = escape(str(request.url_for("dev_pay_newapi_topup", intent_id=intent.intent_id)))
    complete_action = escape(
        str(request.url_for("complete_newapi_topup", intent_id=intent.intent_id))
    )
    code_url = escape(intent.code_url or "")
    payment_block = (
        f"""
        <form method="post" action="{dev_action}">
            <button type="submit">模拟支付成功并返回 NewAPI</button>
        </form>
        """
        if dev_mode
        else f"""
        <p class="hint">易支付收银台链接</p>
        <code>{code_url}</code>
        <form method="get" action="{code_url}" target="_blank">
            <button type="submit">打开支付链接</button>
        </form>
        <form method="get" action="{complete_action}">
            <button type="submit">已完成支付，返回 NewAPI</button>
        </form>
        """
    )
    return f"""
    <!doctype html>
    <html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>MetaView NewAPI 充值收银台</title>
        <style>
            body {{
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                background: #f6f7f9;
                color: #17181c;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }}
            main {{
                width: min(520px, calc(100vw - 32px));
                background: #fff;
                border: 1px solid #e3e5ea;
                border-radius: 8px;
                padding: 28px;
                box-shadow: 0 18px 60px rgba(17, 24, 39, 0.08);
            }}
            h1 {{
                margin: 0 0 20px;
                font-size: 24px;
                line-height: 1.25;
            }}
            dl {{
                display: grid;
                grid-template-columns: 112px 1fr;
                gap: 10px 16px;
                margin: 0 0 24px;
            }}
            dt {{
                color: #616774;
            }}
            dd {{
                margin: 0;
                font-weight: 600;
                overflow-wrap: anywhere;
            }}
            button {{
                width: 100%;
                height: 44px;
                border: 0;
                border-radius: 8px;
                background: #16833a;
                color: white;
                font-size: 16px;
                font-weight: 650;
                cursor: pointer;
            }}
            code {{
                display: block;
                padding: 12px;
                border-radius: 6px;
                background: #f1f3f6;
                overflow-wrap: anywhere;
            }}
            .hint {{
                margin: 0 0 8px;
                color: #616774;
            }}
        </style>
    </head>
    <body>
        <main>
            <h1>MetaView NewAPI 充值收银台</h1>
            <dl>
                <dt>充值金额</dt>
                <dd>¥{amount}</dd>
                <dt>兑换额度</dt>
                <dd>{quota} quota</dd>
                <dt>订单号</dt>
                <dd>{escape(intent.order_id)}</dd>
            </dl>
            {payment_block}
        </main>
    </body>
    </html>
    """
