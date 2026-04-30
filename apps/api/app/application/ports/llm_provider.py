from __future__ import annotations

from typing import Protocol


class ILLMProvider(Protocol):
    async def complete(self, system: str, user: str) -> str: ...
