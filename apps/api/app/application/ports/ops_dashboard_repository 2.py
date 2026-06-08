from __future__ import annotations

from typing import Literal, Protocol

from app.application.dto.ops_dashboard_dto import OpsDashboardResponse


class IOpsDashboardRepository(Protocol):
    async def get_dashboard(
        self,
        *,
        window_days: Literal[7, 30, 90],
        limit: int,
    ) -> OpsDashboardResponse: ...
