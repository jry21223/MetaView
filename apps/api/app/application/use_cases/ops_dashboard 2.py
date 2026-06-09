from __future__ import annotations

from typing import Literal

from app.application.dto.ops_dashboard_dto import OpsDashboardResponse
from app.application.ports.ops_dashboard_repository import IOpsDashboardRepository
from app.config import Settings
from app.domain.models.account import SessionAccount


class OpsDashboardPermissionError(RuntimeError):
    pass


class OpsDashboardUseCase:
    def __init__(self, settings: Settings, repo: IOpsDashboardRepository) -> None:
        self._settings = settings
        self._repo = repo

    async def get_dashboard(
        self,
        *,
        session: SessionAccount,
        window_days: Literal[7, 30, 90],
        limit: int,
    ) -> OpsDashboardResponse:
        account = session.account
        if (
            self._settings.app_edition != "ops"
            or account.role != "admin"
            or account.status != "enabled"
        ):
            raise OpsDashboardPermissionError("需要管理员权限")
        return await self._repo.get_dashboard(window_days=window_days, limit=limit)
