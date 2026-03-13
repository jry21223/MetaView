from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.schemas import (
    CustomProviderUpsertRequest,
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunSummary,
    ProviderKind,
    SandboxStatus,
    TopicDomain,
)


@dataclass(frozen=True)
class StoredCustomProvider:
    name: str
    label: str
    kind: ProviderKind
    base_url: str
    model: str
    api_key: str | None
    description: str
    temperature: float
    supports_vision: bool
    enabled: bool


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
                    router_provider TEXT,
                    generation_provider TEXT,
                    sandbox_status TEXT NOT NULL,
                    request_payload TEXT NOT NULL,
                    response_payload TEXT NOT NULL
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(pipeline_runs)").fetchall()
            }
            if "router_provider" not in columns:
                connection.execute(
                    """
                    ALTER TABLE pipeline_runs
                    ADD COLUMN router_provider TEXT
                    """
                )
            if "generation_provider" not in columns:
                connection.execute(
                    """
                    ALTER TABLE pipeline_runs
                    ADD COLUMN generation_provider TEXT
                    """
                )

    def save_run(self, request: PipelineRequest, response: PipelineResponse) -> str:
        created_at = datetime.now(timezone.utc).isoformat()
        effective_request = request.model_copy(update={"domain": response.cir.domain})

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
                    router_provider,
                    generation_provider,
                    sandbox_status,
                    request_payload,
                    response_payload
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    response.request_id,
                    created_at,
                    effective_request.prompt,
                    response.cir.title,
                    response.cir.domain.value,
                    response.runtime.provider.name if response.runtime.provider else "",
                    response.runtime.router_provider.name
                    if response.runtime.router_provider
                    else response.runtime.provider.name if response.runtime.provider else "",
                    response.runtime.generation_provider.name
                    if response.runtime.generation_provider
                    else response.runtime.provider.name if response.runtime.provider else "",
                    response.runtime.sandbox.status.value,
                    json.dumps(effective_request.model_dump(mode="json"), ensure_ascii=False),
                    json.dumps(response.model_dump(mode="json"), ensure_ascii=False),
                ),
            )

        return created_at

    def list_runs(self, limit: int = 20) -> list[PipelineRunSummary]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT
                    request_id,
                    created_at,
                    prompt,
                    title,
                    domain,
                    provider,
                    COALESCE(router_provider, provider) AS router_provider,
                    COALESCE(generation_provider, provider) AS generation_provider,
                    sandbox_status
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
                provider=row["provider"],
                router_provider=row["router_provider"],
                generation_provider=row["generation_provider"],
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


class CustomProviderRepository:
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
                CREATE TABLE IF NOT EXISTS custom_providers (
                    name TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    model TEXT NOT NULL,
                    api_key TEXT,
                    description TEXT NOT NULL,
                    temperature REAL NOT NULL,
                    supports_vision INTEGER NOT NULL DEFAULT 0,
                    enabled INTEGER NOT NULL
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(custom_providers)").fetchall()
            }
            if "supports_vision" not in columns:
                connection.execute(
                    """
                    ALTER TABLE custom_providers
                    ADD COLUMN supports_vision INTEGER NOT NULL DEFAULT 0
                    """
                )

    def upsert(self, provider: CustomProviderUpsertRequest) -> StoredCustomProvider:
        stored = StoredCustomProvider(
            name=provider.name,
            label=provider.label,
            kind=ProviderKind.OPENAI_COMPATIBLE,
            base_url=provider.base_url.rstrip("/"),
            model=provider.model,
            api_key=provider.api_key or None,
            description=provider.description,
            temperature=provider.temperature,
            supports_vision=provider.supports_vision,
            enabled=provider.enabled,
        )

        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO custom_providers (
                    name, label, kind, base_url, model, api_key, description, temperature,
                    supports_vision, enabled
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    stored.name,
                    stored.label,
                    stored.kind.value,
                    stored.base_url,
                    stored.model,
                    stored.api_key,
                    stored.description,
                    stored.temperature,
                    1 if stored.supports_vision else 0,
                    1 if stored.enabled else 0,
                ),
            )

        return stored

    def list_all(self) -> list[StoredCustomProvider]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT
                    name, label, kind, base_url, model, api_key, description, temperature,
                    supports_vision, enabled
                FROM custom_providers
                ORDER BY name ASC
                """
            ).fetchall()

        return [
            StoredCustomProvider(
                name=row["name"],
                label=row["label"],
                kind=ProviderKind(row["kind"]),
                base_url=row["base_url"],
                model=row["model"],
                api_key=row["api_key"],
                description=row["description"],
                temperature=float(row["temperature"]),
                supports_vision=bool(row["supports_vision"]),
                enabled=bool(row["enabled"]),
            )
            for row in rows
        ]

    def get(self, name: str) -> StoredCustomProvider | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT
                    name, label, kind, base_url, model, api_key, description, temperature,
                    supports_vision, enabled
                FROM custom_providers
                WHERE name = ?
                """,
                (name,),
            ).fetchone()

        if row is None:
            return None

        return StoredCustomProvider(
            name=row["name"],
            label=row["label"],
            kind=ProviderKind(row["kind"]),
            base_url=row["base_url"],
            model=row["model"],
            api_key=row["api_key"],
            description=row["description"],
            temperature=float(row["temperature"]),
            supports_vision=bool(row["supports_vision"]),
            enabled=bool(row["enabled"]),
        )

    def delete(self, name: str) -> bool:
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                """
                DELETE FROM custom_providers
                WHERE name = ?
                """,
                (name,),
            )

        return cursor.rowcount > 0
