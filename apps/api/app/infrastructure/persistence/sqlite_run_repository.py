from __future__ import annotations

import sqlite3

from app.application.dto.pipeline_dto import PipelineRunResponse
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript


class SqliteRunRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def create(self, run_id: str, prompt: str, created_at: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO pipeline_runs"
                " (run_id, status, prompt, created_at) VALUES (?, ?, ?, ?)",
                (run_id, PipelineRunStatus.QUEUED.value, prompt, created_at),
            )
            conn.commit()

    def update(
        self,
        run_id: str,
        *,
        status: PipelineRunStatus,
        playbook_json: str | None = None,
        error: str | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE pipeline_runs SET status=?, playbook_json=?, error=? WHERE run_id=?",
                (status.value, playbook_json, error, run_id),
            )
            conn.commit()

    def get(self, run_id: str) -> PipelineRunResponse | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM pipeline_runs WHERE run_id=?", (run_id,)
            ).fetchone()
        if row is None:
            return None
        return _row_to_response(row)

    def list(self, limit: int = 50) -> list[PipelineRunResponse]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [_row_to_response(r) for r in rows]


def _row_to_response(row: sqlite3.Row) -> PipelineRunResponse:
    playbook = None
    if row["playbook_json"]:
        playbook = PlaybookScript.model_validate_json(row["playbook_json"])
    return PipelineRunResponse(
        run_id=row["run_id"],
        status=PipelineRunStatus(row["status"]),
        playbook=playbook,
        error=row["error"],
        created_at=row["created_at"],
    )
