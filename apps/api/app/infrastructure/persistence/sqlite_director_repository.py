from __future__ import annotations

import asyncio
import sqlite3

from app.domain.models.director import DirectorScript


class SqliteRunDirectorRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def upsert(self, director: DirectorScript, updated_at: str) -> None:
        director_json = director.model_dump_json()

        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO pipeline_run_directors
                        (run_id, director_json, source, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(run_id) DO UPDATE SET
                        director_json=excluded.director_json,
                        source=excluded.source,
                        updated_at=excluded.updated_at
                    """,
                    (
                        director.run_id,
                        director_json,
                        director.source,
                        updated_at,
                        updated_at,
                    ),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def get(self, run_id: str) -> DirectorScript | None:
        def _sync() -> sqlite3.Row | None:
            with self._connect() as conn:
                return conn.execute(
                    "SELECT director_json FROM pipeline_run_directors WHERE run_id=?",
                    (run_id,),
                ).fetchone()

        row = await asyncio.to_thread(_sync)
        if row is None or not row["director_json"]:
            return None
        return DirectorScript.model_validate_json(row["director_json"])

    async def delete(self, run_id: str) -> bool:
        def _sync() -> bool:
            with self._connect() as conn:
                cursor = conn.execute(
                    "DELETE FROM pipeline_run_directors WHERE run_id=?",
                    (run_id,),
                )
                conn.commit()
                return cursor.rowcount > 0

        return await asyncio.to_thread(_sync)
