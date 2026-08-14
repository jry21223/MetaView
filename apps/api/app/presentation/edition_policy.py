from __future__ import annotations

from fastapi import HTTPException
from starlette.requests import Request

from app.application.use_cases.account import AccountUseCase
from app.config import Settings
from app.domain.models.account import SessionAccount

ACCOUNT_DISABLED_DETAIL = "账户功能仅在运营版可用"
LOGIN_REQUIRED_DETAIL = "请先使用微信登录"
OPS_ADMIN_REQUIRED_DETAIL = "需要管理员权限"


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


async def require_bound_admin_session(
    request: Request,
    settings: Settings,
    account_use_case: AccountUseCase,
) -> SessionAccount:
    """Guards every ops route behind the single bound ops-admin identity.

    Runs the existing WeChat session + enabled-status gate, then enforces the
    issue #226 trust boundary: ``role == admin`` AND ``user_id ==
    settings.ops_admin_user_id``. The bound-admin check lives here once so ops
    routes never duplicate it. ``require_wechat_session`` stays available for
    non-admin account routes that should not bind to the ops admin.
    """
    if settings.app_edition != "ops":
        raise HTTPException(status_code=403, detail=OPS_ADMIN_REQUIRED_DETAIL)
    session = await require_wechat_session(request, settings, account_use_case)
    account = session.account
    if account.role != "admin":
        raise HTTPException(status_code=403, detail=OPS_ADMIN_REQUIRED_DETAIL)
    ops_admin_user_id = settings.ops_admin_user_id
    if ops_admin_user_id and account.user_id != ops_admin_user_id:
        raise HTTPException(status_code=403, detail=OPS_ADMIN_REQUIRED_DETAIL)
    return session
