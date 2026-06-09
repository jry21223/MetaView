from __future__ import annotations

from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from starlette.requests import Request

from app.application.dto.ops_dashboard_dto import OpsDashboardResponse
from app.application.use_cases.account import AccountUseCase
from app.application.use_cases.ops_dashboard import (
    OpsDashboardPermissionError,
    OpsDashboardUseCase,
)
from app.config import Settings, get_settings
from app.domain.models.account import SessionAccount
from app.presentation.dependencies import get_account_use_case, get_ops_dashboard_use_case
from app.presentation.rate_limit import read_limit

router = APIRouter(prefix="/ops", tags=["ops"])


@router.get("/dashboard", response_model=OpsDashboardResponse)
@read_limit()
async def get_ops_dashboard(
    request: Request,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
    use_case: Annotated[OpsDashboardUseCase, Depends(get_ops_dashboard_use_case)],
    window_days: Annotated[int, Query()] = 30,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> OpsDashboardResponse:
    if window_days not in {7, 30, 90}:
        raise HTTPException(status_code=422, detail="window_days must be one of 7, 30, 90")
    session = await _session(request, response, settings, account_use_case)
    try:
        return await use_case.get_dashboard(
            session=session,
            window_days=cast(Literal[7, 30, 90], window_days),
            limit=limit,
        )
    except OpsDashboardPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


async def _session(
    request: Request,
    response: Response,
    settings: Settings,
    account_use_case: AccountUseCase,
) -> SessionAccount:
    session = await account_use_case.get_or_create_session(
        request.cookies.get(settings.account_session_cookie)
    )
    if request.cookies.get(settings.account_session_cookie) != session.token:
        response.set_cookie(
            settings.account_session_cookie,
            session.token,
            max_age=settings.account_session_days * 24 * 60 * 60,
            httponly=True,
            secure=settings.account_session_secure,
            samesite="lax",
        )
    return session
