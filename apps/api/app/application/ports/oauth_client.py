from __future__ import annotations

from typing import Protocol

from app.domain.models.account import OAuthIdentity


class IOAuthClient(Protocol):
    @property
    def configured(self) -> bool: ...

    def build_login_url(self, state: str) -> str: ...

    async def fetch_identity(self, code: str) -> OAuthIdentity: ...
