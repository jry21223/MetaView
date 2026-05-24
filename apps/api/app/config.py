from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ALL_DOMAINS = "algorithm,math,code,physics,chemistry,biology,geography"

GenerationMode = Literal["single", "agent"]
_GENERATION_MODES: frozenset[str] = frozenset(("single", "agent"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="METAVIEW_",
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    app_name: str = "MetaView API"
    app_version: str = "2.0.0"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    default_provider: str | None = None
    default_router_provider: str | None = None
    default_generation_provider: str | None = None
    mock_provider_enabled: bool = True
    enabled_domains: str = _ALL_DOMAINS
    max_repair_attempts: int = 2
    pipeline_timeout_s: float | None = 900.0
    history_db_path: str = "data/pipeline_runs.db"
    reviewer_mode: str = "on_failure"

    # Request-shape guards (issue #39). Defaults protect against accidental
    # large-body uploads and runaway LLM cost; production should tune via
    # METAVIEW_* env vars.
    max_body_bytes: int = 5_000_000  # 5 MB
    rate_limit_enabled: bool = True
    rate_limit_write: str = "10/minute"  # POST pipeline/exports — LLM cost path
    rate_limit_read: str = "60/minute"  # GET runs/exports — cheap reads

    # Remotion playbook defaults — all configurable, no hardcoding in domain code
    playbook_default_fps: int = 30
    playbook_default_step_frames: int = 60
    playbook_composition_width: int = 960
    playbook_composition_height: int = 540

    # Export (Remotion render) — relative to repo root unless absolute
    export_web_app_dir: str = "apps/web"
    export_artifacts_dir: str = "data/exports"

    # TTS proxy (issue #40) — the player no longer stores an OpenAI key in
    # localStorage. ``tts_api_key`` falls back to ``openai_api_key`` so a
    # single env var still works for hobby setups; production deployments can
    # split them and apply tighter quotas to TTS.
    tts_api_key: str | None = None
    tts_base_url: str = "https://api.openai.com/v1"
    tts_model: str = "tts-1"
    tts_default_voice: str = "alloy"
    tts_timeout_s: float = 60.0

    # OpenAI-compatible provider
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str | None = None
    openai_router_model: str | None = None
    openai_planning_model: str | None = None
    openai_coding_model: str | None = None
    openai_critic_model: str | None = None
    openai_test_model: str | None = None
    openai_supports_vision: bool = False
    openai_timeout_s: float | None = 300.0
    # Generation budget — wider room for longer, more thorough teaching scripts.
    # Set ``None`` to fall back to the provider default; otherwise we pass
    # ``max_tokens`` on each chat/completions call.
    openai_max_tokens: int | None = 16000
    # Optional. When set we forward ``reasoning_effort`` (gpt-5 / o-series) so
    # the model thinks for longer. Leave empty for providers that reject the
    # field (DeepSeek, local vLLM, etc.). Allowed: minimal/low/medium/high.
    openai_reasoning_effort: str | None = None

    # ── Generation pipeline mode (single-shot vs agent sidecar) ─────────────
    # ``single`` keeps the current OpenAIProvider.complete() → CIR JSON path.
    # ``agent`` routes to the apps/agent Node sidecar (pi-agent-core) which
    # builds the PlaybookScript turn-by-turn via Drawing CLI tool calls and
    # calls back into /api/v1/agent/assert/* for sympy-based geometry checks.
    # Toggle is per-deployment; per-request override stays out of scope for now.
    generation_mode: GenerationMode = "single"
    agent_base_url: str = "http://agent:8001"
    agent_timeout_s: float = 600.0

    @field_validator("openai_timeout_s", "pipeline_timeout_s", mode="before")
    @classmethod
    def normalize_optional_timeout(cls, value: float | str | None) -> float | str | None:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("reviewer_mode", mode="before")
    @classmethod
    def normalize_reviewer_mode(cls, value: str | None) -> str:
        if value is None:
            return "on_failure"
        normalized = value.strip().lower()
        if normalized not in {"off", "on_failure", "math_always", "always"}:
            return "on_failure"
        return normalized

    @field_validator("openai_reasoning_effort", mode="before")
    @classmethod
    def normalize_reasoning_effort(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            return None
        if normalized not in {"minimal", "low", "medium", "high"}:
            return None
        return normalized

    @field_validator("generation_mode", mode="before")
    @classmethod
    def normalize_generation_mode(cls, value: str | None) -> GenerationMode:
        if value is None:
            return "single"
        normalized = value.strip().lower()
        if normalized not in _GENERATION_MODES:
            return "single"
        return normalized  # type: ignore[return-value]

    @property
    def enabled_topic_domains(self) -> tuple[str, ...]:
        return tuple(
            item.strip().lower()
            for item in self.enabled_domains.split(",")
            if item.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
