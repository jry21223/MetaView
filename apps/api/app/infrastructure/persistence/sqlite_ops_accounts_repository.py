from __future__ import annotations

import asyncio
import sqlite3

from app.application.dto.ops_accounts_dto import OpsAccountRow, OpsAccountsResponse
from app.domain.models.account import money_from_cents

_SELECT_COLUMNS = """
    SELECT a.user_id, a.display_name, a.avatar_url, a.login_provider,
           a.status, a.role, a.balance_cents, a.created_at,
           COALESCE(a.last_login_at, (
               SELECT MAX(s.created_at) FROM account_sessions s
               WHERE s.user_id = a.user_id
           )) AS last_active_at
    FROM accounts a
"""


class SqliteOpsAccountsRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def list_accounts(
        self,
        *,
        search: str | None,
        page: int,
        page_size: int,
    ) -> OpsAccountsResponse:
        return await asyncio.to_thread(self._list_accounts_sync, search, page, page_size)

    def _list_accounts_sync(
        self,
        search: str | None,
        page: int,
        page_size: int,
    ) -> OpsAccountsResponse:
        where = ""
        params: list[str] = []
        if search:
            pattern = f"%{_escape_like(search)}%"
            where = (
                "WHERE a.display_name LIKE ? ESCAPE '\\' "
                "OR a.user_id LIKE ? ESCAPE '\\'"
            )
            params = [pattern, pattern]
        with self._connect() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM accounts a {where}",
                params,
            ).fetchone()[0]
            rows = conn.execute(
                f"""
                {_SELECT_COLUMNS}
                {where}
                ORDER BY a.created_at DESC, a.user_id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, page_size, (page - 1) * page_size],
            ).fetchall()
        return OpsAccountsResponse(
            items=[_row(row) for row in rows],
            total=total,
            page=page,
            page_size=page_size,
        )


def _row(row: sqlite3.Row) -> OpsAccountRow:
    return OpsAccountRow(
        user_id=row["user_id"],
        display_name=row["display_name"],
        avatar_url=row["avatar_url"],
        login_provider=row["login_provider"],
        status=row["status"],
        role=row["role"],
        balance_yuan=money_from_cents(row["balance_cents"]),
        created_at=row["created_at"],
        last_active_at=row["last_active_at"],
    )


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so user input matches literally, not as a pattern."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
