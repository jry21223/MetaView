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
    PipelineRunStatus,
    PipelineRunSummary,
    ProviderKind,
    RuntimeSettingsRequest,
    SandboxStatus,
    TopicDomain,
    TTSSettingsRequest,
)


@dataclass(frozen=True)
class StoredCustomProvider:
    name: str
    label: str
    kind: ProviderKind
    base_url: str
    model: str
    router_model: str | None
    planning_model: str | None
    coding_model: str | None
    critic_model: str | None
    test_model: str | None
    api_key: str | None
    description: str
    temperature: float
    supports_vision: bool
    enabled: bool

    @property
    def stage_models(self) -> dict[str, str]:
        stage_models: dict[str, str] = {}
        if self.router_model:
            stage_models["router"] = self.router_model
        if self.planning_model:
            stage_models["planning"] = self.planning_model
        if self.coding_model:
            stage_models["coding"] = self.coding_model
        if self.critic_model:
            stage_models["critic"] = self.critic_model
        if self.test_model:
            stage_models["test"] = self.test_model
        return stage_models


@dataclass(frozen=True)
class StoredTTSSettings:
    enabled: bool
    backend: str
    model: str
    base_url: str | None
    api_key: str | None
    voice: str
    rate_wpm: int
    speed: float
    max_chars: int
    timeout_s: float | None

    def to_response_payload(self) -> dict[str, object]:
        return {
            "enabled": self.enabled,
            "backend": self.backend,
            "model": self.model,
            "base_url": self.base_url,
            "api_key_configured": bool(self.api_key),
            "voice": self.voice,
            "rate_wpm": self.rate_wpm,
            "speed": self.speed,
            "max_chars": self.max_chars,
            "timeout_s": self.timeout_s,
        }


@dataclass(frozen=True)
class StoredRuntimeSettings:
    mock_provider_enabled: bool
    tts: StoredTTSSettings

    def to_response_payload(self) -> dict[str, object]:
        return {
            "mock_provider_enabled": self.mock_provider_enabled,
            "tts": self.tts.to_response_payload(),
        }


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
                    updated_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    title TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    router_provider TEXT,
                    generation_provider TEXT,
                    sandbox_status TEXT NOT NULL,
                    request_payload TEXT NOT NULL,
                    response_payload TEXT NOT NULL,
                    error_message TEXT
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(pipeline_runs)").fetchall()
            }
            if "updated_at" not in columns:
                connection.execute(
                    """
                    ALTER TABLE pipeline_runs
                    ADD COLUMN updated_at TEXT
                    """
                )
                connection.execute(
                    """
                    UPDATE pipeline_runs
                    SET updated_at = created_at
                    WHERE updated_at IS NULL OR updated_at = ''
                    """
                )
            if "status" not in columns:
                connection.execute(
                    """
                    ALTER TABLE pipeline_runs
                    ADD COLUMN status TEXT
                    """
                )
                connection.execute(
                    """
                    UPDATE pipeline_runs
                    SET status = ?
                    WHERE status IS NULL OR status = ''
                    """,
                    (PipelineRunStatus.SUCCEEDED.value,),
                )
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
            if "error_message" not in columns:
                connection.execute(
                    """
                    ALTER TABLE pipeline_runs
                    ADD COLUMN error_message TEXT
                    """
                )

    def _timestamp(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def create_submitted_run(
        self,
        *,
        request_id: str,
        request: PipelineRequest,
    ) -> str:
        created_at = self._timestamp()
        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO pipeline_runs (
                    request_id,
                    created_at,
                    updated_at,
                    status,
                    prompt,
                    title,
                    domain,
                    provider,
                    router_provider,
                    generation_provider,
                    sandbox_status,
                    request_payload,
                    response_payload,
                    error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request_id,
                    created_at,
                    created_at,
                    PipelineRunStatus.QUEUED.value,
                    request.prompt,
                    "正在生成",
                    request.domain.value if request.domain is not None else "",
                    request.provider or "",
                    request.router_provider or "",
                    request.generation_provider or request.provider or "",
                    "",
                    json.dumps(request.model_dump(mode="json"), ensure_ascii=False),
                    "",
                    None,
                ),
            )
        return created_at

    def mark_run_running(self, request_id: str) -> None:
        updated_at = self._timestamp()
        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                UPDATE pipeline_runs
                SET status = ?, updated_at = ?, error_message = NULL
                WHERE request_id = ?
                """,
                (PipelineRunStatus.RUNNING.value, updated_at, request_id),
            )

    def save_run(self, request: PipelineRequest, response: PipelineResponse) -> str:
        created_at = self._timestamp()
        updated_at = created_at
        effective_request = request.model_copy(update={"domain": response.cir.domain})

        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                """
                UPDATE pipeline_runs
                SET
                    updated_at = ?,
                    status = ?,
                    prompt = ?,
                    title = ?,
                    domain = ?,
                    provider = ?,
                    router_provider = ?,
                    generation_provider = ?,
                    sandbox_status = ?,
                    request_payload = ?,
                    response_payload = ?,
                    error_message = NULL
                WHERE request_id = ?
                """,
                (
                    updated_at,
                    PipelineRunStatus.SUCCEEDED.value,
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
                    response.request_id,
                ),
            )
            if cursor.rowcount:
                return created_at

            connection.execute(
                """
                INSERT INTO pipeline_runs (
                    request_id,
                    created_at,
                    updated_at,
                    status,
                    prompt,
                    title,
                    domain,
                    provider,
                    router_provider,
                    generation_provider,
                    sandbox_status,
                    request_payload,
                    response_payload,
                    error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    response.request_id,
                    created_at,
                    updated_at,
                    PipelineRunStatus.SUCCEEDED.value,
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
                    None,
                ),
            )

        return created_at

    def mark_run_failed(
        self,
        *,
        request_id: str,
        request: PipelineRequest,
        error_message: str,
    ) -> None:
        updated_at = self._timestamp()
        payload = json.dumps(request.model_dump(mode="json"), ensure_ascii=False)
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                """
                UPDATE pipeline_runs
                SET
                    updated_at = ?,
                    status = ?,
                    prompt = ?,
                    title = ?,
                    domain = ?,
                    provider = ?,
                    router_provider = ?,
                    generation_provider = ?,
                    sandbox_status = ?,
                    request_payload = ?,
                    response_payload = ?,
                    error_message = ?
                WHERE request_id = ?
                """,
                (
                    updated_at,
                    PipelineRunStatus.FAILED.value,
                    request.prompt,
                    "生成失败",
                    request.domain.value if request.domain is not None else "",
                    request.provider or "",
                    request.router_provider or "",
                    request.generation_provider or request.provider or "",
                    "",
                    payload,
                    "",
                    error_message,
                    request_id,
                ),
            )
            if cursor.rowcount:
                return

            connection.execute(
                """
                INSERT INTO pipeline_runs (
                    request_id,
                    created_at,
                    updated_at,
                    status,
                    prompt,
                    title,
                    domain,
                    provider,
                    router_provider,
                    generation_provider,
                    sandbox_status,
                    request_payload,
                    response_payload,
                    error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request_id,
                    updated_at,
                    updated_at,
                    PipelineRunStatus.FAILED.value,
                    request.prompt,
                    "生成失败",
                    request.domain.value if request.domain is not None else "",
                    request.provider or "",
                    request.router_provider or "",
                    request.generation_provider or request.provider or "",
                    "",
                    payload,
                    "",
                    error_message,
                ),
            )

    def list_runs(self, limit: int = 20) -> list[PipelineRunSummary]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT
                    request_id,
                    created_at,
                    updated_at,
                    status,
                    prompt,
                    title,
                    domain,
                    provider,
                    COALESCE(router_provider, provider) AS router_provider,
                    COALESCE(generation_provider, provider) AS generation_provider,
                    sandbox_status,
                    error_message
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
                updated_at=row["updated_at"] or row["created_at"],
                status=PipelineRunStatus(row["status"] or PipelineRunStatus.SUCCEEDED.value),
                prompt=row["prompt"],
                title=row["title"],
                domain=TopicDomain(row["domain"]) if row["domain"] else None,
                provider=row["provider"] or None,
                router_provider=row["router_provider"] or None,
                generation_provider=row["generation_provider"] or None,
                sandbox_status=SandboxStatus(row["sandbox_status"])
                if row["sandbox_status"]
                else None,
                error_message=row["error_message"],
            )
            for row in rows
        ]

    def get_run(self, request_id: str) -> PipelineRunDetail | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT
                    created_at,
                    updated_at,
                    status,
                    error_message,
                    request_payload,
                    response_payload
                FROM pipeline_runs
                WHERE request_id = ?
                """,
                (request_id,),
            ).fetchone()

        if row is None:
            return None

        return PipelineRunDetail(
            created_at=row["created_at"],
            updated_at=row["updated_at"] or row["created_at"],
            status=PipelineRunStatus(row["status"] or PipelineRunStatus.SUCCEEDED.value),
            error_message=row["error_message"],
            request=PipelineRequest.model_validate(json.loads(row["request_payload"])),
            response=(
                PipelineResponse.model_validate(json.loads(row["response_payload"]))
                if row["response_payload"]
                else None
            ),
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
                    router_model TEXT,
                    planning_model TEXT,
                    coding_model TEXT,
                    critic_model TEXT,
                    test_model TEXT,
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
            stage_columns = {
                "router_model",
                "planning_model",
                "coding_model",
                "critic_model",
                "test_model",
            }
            for column in stage_columns:
                if column in columns:
                    continue
                connection.execute(
                    f"""
                    ALTER TABLE custom_providers
                    ADD COLUMN {column} TEXT
                    """
                )

    def upsert(self, provider: CustomProviderUpsertRequest) -> StoredCustomProvider:
        existing = self.get(provider.name)
        api_key = provider.api_key or (existing.api_key if existing is not None else None)
        stored = StoredCustomProvider(
            name=provider.name,
            label=provider.label,
            kind=ProviderKind.OPENAI_COMPATIBLE,
            base_url=provider.base_url.rstrip("/"),
            model=provider.model,
            router_model=provider.router_model,
            planning_model=provider.planning_model,
            coding_model=provider.coding_model,
            critic_model=provider.critic_model,
            test_model=provider.test_model,
            api_key=api_key,
            description=provider.description,
            temperature=provider.temperature,
            supports_vision=provider.supports_vision,
            enabled=provider.enabled,
        )

        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO custom_providers (
                    name, label, kind, base_url, model, router_model, planning_model,
                    coding_model, critic_model, test_model, api_key, description, temperature,
                    supports_vision, enabled
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    stored.name,
                    stored.label,
                    stored.kind.value,
                    stored.base_url,
                    stored.model,
                    stored.router_model,
                    stored.planning_model,
                    stored.coding_model,
                    stored.critic_model,
                    stored.test_model,
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
                    name, label, kind, base_url, model, router_model, planning_model,
                    coding_model, critic_model, test_model, api_key, description,
                    temperature, supports_vision, enabled
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
                router_model=row["router_model"],
                planning_model=row["planning_model"],
                coding_model=row["coding_model"],
                critic_model=row["critic_model"],
                test_model=row["test_model"],
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
                    name, label, kind, base_url, model, router_model, planning_model,
                    coding_model, critic_model, test_model, api_key, description,
                    temperature, supports_vision, enabled
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
            router_model=row["router_model"],
            planning_model=row["planning_model"],
            coding_model=row["coding_model"],
            critic_model=row["critic_model"],
            test_model=row["test_model"],
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


class RuntimeSettingsRepository:
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
                CREATE TABLE IF NOT EXISTS app_settings (
                    name TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )

    def get_runtime_settings(
        self,
        *,
        defaults: RuntimeSettingsRequest,
    ) -> StoredRuntimeSettings:
        payload = defaults.model_dump(mode="json")
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT value
                FROM app_settings
                WHERE name = ?
                """,
                ("runtime_settings",),
            ).fetchone()

        if row is not None:
            stored_payload = json.loads(row["value"])
            payload = self._merge_runtime_payload(payload, stored_payload)

        return self._build_runtime_settings(payload)

    def save_runtime_settings(
        self,
        payload: RuntimeSettingsRequest,
        *,
        defaults: RuntimeSettingsRequest,
    ) -> StoredRuntimeSettings:
        stored_payload = {
            "mock_provider_enabled": payload.mock_provider_enabled,
            "tts": {
                "enabled": payload.tts.enabled,
                "backend": payload.tts.backend,
                "model": payload.tts.model,
                "base_url": payload.tts.base_url,
                "api_key": payload.tts.api_key,
                "voice": payload.tts.voice,
                "rate_wpm": payload.tts.rate_wpm,
                "speed": payload.tts.speed,
                "max_chars": payload.tts.max_chars,
                "timeout_s": payload.tts.timeout_s,
            },
        }

        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO app_settings (name, value)
                VALUES (?, ?)
                """,
                (
                    "runtime_settings",
                    json.dumps(stored_payload, ensure_ascii=False),
                ),
            )

        return self._build_runtime_settings(stored_payload)

    def _merge_runtime_payload(
        self,
        default_payload: dict[str, object],
        stored_payload: dict[str, object],
    ) -> dict[str, object]:
        merged = dict(default_payload)
        merged["mock_provider_enabled"] = stored_payload.get(
            "mock_provider_enabled",
            default_payload["mock_provider_enabled"],
        )
        merged_tts = dict(default_payload.get("tts", {}))
        merged_tts.update(stored_payload.get("tts", {}))
        merged["tts"] = merged_tts
        return merged

    def _build_runtime_settings(
        self,
        payload: dict[str, object],
    ) -> StoredRuntimeSettings:
        validated = RuntimeSettingsRequest.model_validate(payload)
        tts_request = TTSSettingsRequest.model_validate(validated.tts.model_dump(mode="json"))
        return StoredRuntimeSettings(
            mock_provider_enabled=validated.mock_provider_enabled,
            tts=StoredTTSSettings(
                enabled=tts_request.enabled,
                backend=tts_request.backend,
                model=tts_request.model,
                base_url=tts_request.base_url,
                api_key=tts_request.api_key,
                voice=tts_request.voice,
                rate_wpm=tts_request.rate_wpm,
                speed=tts_request.speed,
                max_chars=tts_request.max_chars,
                timeout_s=tts_request.timeout_s,
            ),
        )
