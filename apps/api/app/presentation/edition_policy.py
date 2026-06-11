from __future__ import annotations

from fastapi import HTTPException
from starlette.requests import Request

from app.application.use_cases.account import AccountUseCase
from app.config import Settings
from app.domain.models.account import SessionAccount

ACCOUNT_DISABLED_DETAIL = "账户功能仅在运营版可用"
LOGIN_REQUIRED_DETAIL = "请先使用微信登录"


def require_account_features(settings: Settings) -> None:
    if settings.app_edition != "ops":
        raise HTTPException(status_code=404, detail=ACCOUNT_DISABLED_DETAIL)


async def require_wechat_session(
    request: Request,
    settings: Settings,
    account_use_case: AccountUseCase,
) -> SessionAccount:
    require_account_features(settings)
    token = request.cookies.get(settings.account_session_cookie)
    session = await account_use_case.get_session(token)
    if session is None or session.account.login_provider != "wechat":
        raise HTTPException(status_code=401, detail=LOGIN_REQUIRED_DETAIL)
    if session.account.status != "enabled":
        raise HTTPException(status_code=403, detail="账户已禁用")
    return session
