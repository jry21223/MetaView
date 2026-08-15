from __future__ import annotations

from app.application.dto.ops_accounts_dto import OpsAccountsResponse
from app.application.ports.ops_accounts_repository import IOpsAccountsRepository
from app.config import Settings
from app.domain.models.account import SessionAccount


class OpsAccountsPermissionError(RuntimeError):
    pass


class OpsAccountsUseCase:
    def __init__(self, settings: Settings, repo: IOpsAccountsRepository) -> None:
        self._settings = settings
        self._repo = repo

    async def list_accounts(
        self,
        *,
        session: SessionAccount,
        search: str | None,
        page: int,
        page_size: int,
    ) -> OpsAccountsResponse:
        account = session.account
        if (
            self._settings.app_edition != "ops"
            or account.role != "admin"
            or account.status != "enabled"
        ):
            raise OpsAccountsPermissionError("需要管理员权限")
        return await self._repo.list_accounts(
            search=search,
            page=page,
            page_size=page_size,
        )
