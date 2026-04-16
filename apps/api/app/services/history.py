from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.schemas import (
    CustomProviderUpsertRequest,
    OutputMode,
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunStatus,
    PipelineRunSummary,
    ProviderKind,
    RuntimeSettingsRequest,
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
class StoredManimSettings:
    python_path: str
    cli_module: str
    quality: str
    format: str
    disable_caching: bool
    render_timeout_s: float | None

    def to_response_payload(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class StoredCJKFontSettings:
    family: str
    path: str | None

    def to_response_payload(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class StoredOpenAIProviderSettings:
    api_key: str | None
    base_url: str
    model: str | None
    router_model: str | None
    planning_model: str | None
    coding_model: str | None
    critic_model: str | None
    test_model: str | None
    supports_vision: bool
    timeout_s: float | None

    def to_response_payload(self) -> dict[str, object]:
        return {
            "api_key_configured": bool(self.api_key),
            "base_url": self.base_url,
            "model": self.model,
            "router_model": self.router_model,
            "planning_model": self.planning_model,
            "coding_model": self.coding_model,
            "critic_model": self.critic_model,
            "test_model": self.test_model,
            "supports_vision": self.supports_vision,
            "timeout_s": self.timeout_s,
        }


@dataclass(frozen=True)
class StoredProviderDefaults:
    default_provider: str | None
    default_router_provider: str | None
    default_generation_provider: str | None

    def to_response_payload(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class StoredCorsSettings:
    origin_regex: str

    def to_response_payload(self) -> dict[str, object]:
        return asdict(self)


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
    enabled_domains: str
    render_backend: str
    manim: StoredManimSettings
    cjk_font: StoredCJKFontSettings
    openai: StoredOpenAIProviderSettings
    default_providers: StoredProviderDefaults
    cors: StoredCorsSettings
    tts: StoredTTSSettings

    def to_response_payload(self) -> dict[str, object]:
        return {
            "mock_provider_enabled": self.mock_provider_enabled,
            "enabled_domains": self.enabled_domains,
            "render_backend": self.render_backend,
            "manim": self.manim.to_response_payload(),
            "cjk_font": self.cjk_font.to_response_payload(),
            "openai": self.openai.to_response_payload(),
            "default_providers": self.default_providers.to_response_payload(),
            "cors": self.cors.to_response_payload(),
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
                    output_mode TEXT NOT NULL,
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
            if "output_mode" not in columns:
                connection.execute(
                    """
                    ALTER TABLE pipeline_runs
                    ADD COLUMN output_mode TEXT NOT NULL DEFAULT 'video'
                    """
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
                    output_mode,
                    provider,
                    router_provider,
                    generation_provider,
                    sandbox_status,
                    request_payload,
                    response_payload,
                    error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request_id,
                    created_at,
                    created_at,
                    PipelineRunStatus.QUEUED.value,
                    request.prompt,
                    "正在生成",
                    request.domain.value if request.domain is not None else "",
                    request.output_mode.value,
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

    def mark_inflight_runs_failed(self, error_message: str) -> int:
        updated_at = self._timestamp()
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                """
                UPDATE pipeline_runs
                SET
                    updated_at = ?,
                    status = ?,
                    title = ?,
                    sandbox_status = ?,
                    response_payload = ?,
                    error_message = ?
                WHERE status IN (?, ?)
                """,
                (
                    updated_at,
                    PipelineRunStatus.FAILED.value,
                    "生成失败",
                    "",
                    "",
                    error_message,
                    PipelineRunStatus.QUEUED.value,
                    PipelineRunStatus.RUNNING.value,
                ),
            )
            return int(cursor.rowcount or 0)

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
                    output_mode = ?,
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
                    effective_request.output_mode.value,
                    response.runtime.provider.name if response.runtime.provider else "",
                    response.runtime.router_provider.name
                    if response.runtime.router_provider
                    else response.runtime.provider.name
                    if response.runtime.provider
                    else "",
                    response.runtime.generation_provider.name
                    if response.runtime.generation_provider
                    else response.runtime.provider.name
                    if response.runtime.provider
                    else "",
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
                    output_mode,
                    provider,
                    router_provider,
                    generation_provider,
                    sandbox_status,
                    request_payload,
                    response_payload,
                    error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    response.request_id,
                    created_at,
                    updated_at,
                    PipelineRunStatus.SUCCEEDED.value,
                    effective_request.prompt,
                    response.cir.title,
                    response.cir.domain.value,
                    effective_request.output_mode.value,
                    response.runtime.provider.name if response.runtime.provider else "",
                    response.runtime.router_provider.name
                    if response.runtime.router_provider
                    else response.runtime.provider.name
                    if response.runtime.provider
                    else "",
                    response.runtime.generation_provider.name
                    if response.runtime.generation_provider
                    else response.runtime.provider.name
                    if response.runtime.provider
                    else "",
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
                    output_mode = ?,
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
                    request.output_mode.value,
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
                    output_mode,
                    provider,
                    router_provider,
                    generation_provider,
                    sandbox_status,
                    request_payload,
                    response_payload,
                    error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request_id,
                    updated_at,
                    updated_at,
                    PipelineRunStatus.FAILED.value,
                    request.prompt,
                    "生成失败",
                    request.domain.value if request.domain is not None else "",
                    request.output_mode.value,
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
                    output_mode,
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
                output_mode=OutputMode(row["output_mode"] or OutputMode.VIDEO.value),
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

    def get_run(
        self,
        request_id: str,
        *,
        include_source_image: bool = False,
        include_raw_output: bool = False,
    ) -> PipelineRunDetail | None:
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

        request_payload = json.loads(row["request_payload"])
        if not include_source_image:
            request_payload = self._strip_request_source_image(request_payload)

        response_payload = None
        if row["response_payload"]:
            response_payload = json.loads(row["response_payload"])
            if not include_raw_output:
                response_payload = self._strip_response_raw_output(response_payload)

        return PipelineRunDetail(
            created_at=row["created_at"],
            updated_at=row["updated_at"] or row["created_at"],
            status=PipelineRunStatus(row["status"] or PipelineRunStatus.SUCCEEDED.value),
            error_message=row["error_message"],
            request=PipelineRequest.model_validate(request_payload),
            response=(
                PipelineResponse.model_validate(response_payload)
                if response_payload is not None
                else None
            ),
        )

    @staticmethod
    def _strip_request_source_image(payload: dict) -> dict:
        if "source_image" not in payload:
            return payload
        sanitized = dict(payload)
        sanitized["source_image"] = None
        return sanitized

    @staticmethod
    def _strip_response_raw_output(payload: dict) -> dict:
        runtime = payload.get("runtime")
        if not isinstance(runtime, dict):
            return payload

        traces = runtime.get("agent_traces")
        if not isinstance(traces, list):
            return payload

        sanitized_traces: list[dict] = []
        changed = False
        for trace in traces:
            if not isinstance(trace, dict):
                sanitized_traces.append(trace)
                continue
            if trace.get("raw_output") is None:
                sanitized_traces.append(trace)
                continue
            changed = True
            sanitized_trace = dict(trace)
            sanitized_trace["raw_output"] = None
            sanitized_traces.append(sanitized_trace)

        if not changed:
            return payload

        sanitized_runtime = dict(runtime)
        sanitized_runtime["agent_traces"] = sanitized_traces
        sanitized_payload = dict(payload)
        sanitized_payload["runtime"] = sanitized_runtime
        return sanitized_payload

    def delete_run(self, request_id: str) -> bool:
        """Delete a pipeline run by request_id.

        Returns True if a row was deleted, False otherwise.
        """
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                """
                DELETE FROM pipeline_runs
                WHERE request_id = ?
                """,
                (request_id,),
            )
            return cursor.rowcount > 0


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
        stored_payload = payload.model_dump(mode="json")

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
        # 顶层字段
        merged["mock_provider_enabled"] = stored_payload.get(
            "mock_provider_enabled",
            default_payload["mock_provider_enabled"],
        )
        merged["enabled_domains"] = stored_payload.get(
            "enabled_domains",
            default_payload["enabled_domains"],
        )
        merged["render_backend"] = stored_payload.get(
            "render_backend",
            default_payload["render_backend"],
        )
        # 嵌套对象逐层合并
        for key in ("manim", "cjk_font", "openai", "default_providers", "cors", "tts"):
            merged_nested = dict(default_payload.get(key, {}))
            merged_nested.update(stored_payload.get(key, {}))
            merged[key] = merged_nested
        return merged

    def _build_runtime_settings(
        self,
        payload: dict[str, object],
    ) -> StoredRuntimeSettings:
        validated = RuntimeSettingsRequest.model_validate(payload)
        return StoredRuntimeSettings(
            mock_provider_enabled=validated.mock_provider_enabled,
            enabled_domains=validated.enabled_domains,
            render_backend=validated.render_backend,
            manim=StoredManimSettings(**validated.manim.model_dump()),
            cjk_font=StoredCJKFontSettings(**validated.cjk_font.model_dump()),
            openai=StoredOpenAIProviderSettings(**validated.openai.model_dump()),
            default_providers=StoredProviderDefaults(**validated.default_providers.model_dump()),
            cors=StoredCorsSettings(**validated.cors.model_dump()),
            tts=StoredTTSSettings(**validated.tts.model_dump()),
        )
