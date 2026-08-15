from __future__ import annotations

from pydantic import BaseModel


class OpsAccountRow(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None = None
    login_provider: str
    status: str
    role: str
    balance_yuan: str
    created_at: str
    last_active_at: str | None = None


class OpsAccountsResponse(BaseModel):
    items: list[OpsAccountRow]
    total: int
    page: int
    page_size: int
