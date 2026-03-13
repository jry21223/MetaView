from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from app.schemas import (
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunSummary,
    ProviderName,
    SandboxStatus,
    TopicDomain,
)


class RunRepository:
    def __init__(self, db_path: str) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS pipeline_runs (
                    request_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    title TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    sandbox_status TEXT NOT NULL,
                    request_payload TEXT NOT NULL,
                    response_payload TEXT NOT NULL
                )
                """
            )

    def save_run(self, request: PipelineRequest, response: PipelineResponse) -> str:
        created_at = datetime.now(timezone.utc).isoformat()

        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO pipeline_runs (
                    request_id,
                    created_at,
                    prompt,
                    title,
                    domain,
                    provider,
                    sandbox_status,
                    request_payload,
                    response_payload
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    response.request_id,
                    created_at,
                    request.prompt,
                    response.cir.title,
                    request.domain.value,
                    response.runtime.provider.name.value,
                    response.runtime.sandbox.status.value,
                    json.dumps(request.model_dump(mode="json"), ensure_ascii=False),
                    json.dumps(response.model_dump(mode="json"), ensure_ascii=False),
                ),
            )

        return created_at

    def list_runs(self, limit: int = 20) -> list[PipelineRunSummary]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT request_id, created_at, prompt, title, domain, provider, sandbox_status
                FROM pipeline_runs
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [
            PipelineRunSummary(
                request_id=row["request_id"],
                created_at=row["created_at"],
                prompt=row["prompt"],
                title=row["title"],
                domain=TopicDomain(row["domain"]),
                provider=ProviderName(row["provider"]),
                sandbox_status=SandboxStatus(row["sandbox_status"]),
            )
            for row in rows
        ]

    def get_run(self, request_id: str) -> PipelineRunDetail | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT created_at, request_payload, response_payload
                FROM pipeline_runs
                WHERE request_id = ?
                """,
                (request_id,),
            ).fetchone()

        if row is None:
            return None

        return PipelineRunDetail(
            created_at=row["created_at"],
            request=PipelineRequest.model_validate(json.loads(row["request_payload"])),
            response=PipelineResponse.model_validate(json.loads(row["response_payload"])),
        )
