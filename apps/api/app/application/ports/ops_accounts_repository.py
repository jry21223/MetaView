from __future__ import annotations

from typing import Protocol

from app.application.dto.ops_accounts_dto import OpsAccountsResponse


class IOpsAccountsRepository(Protocol):
    async def list_accounts(
        self,
        *,
        search: str | None,
        page: int,
        page_size: int,
    ) -> OpsAccountsResponse: ...
