from __future__ import annotations

from typing import Protocol

from app.domain.models.director import DirectorScript


class IRunDirectorRepository(Protocol):
    async def upsert(self, director: DirectorScript, updated_at: str) -> None: ...

    async def get(self, run_id: str) -> DirectorScript | None: ...

    async def delete(self, run_id: str) -> bool: ...
