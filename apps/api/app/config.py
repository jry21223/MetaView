from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ALL_DOMAINS = "algorithm,math,code,physics,chemistry,biology,geography"


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
    history_db_path: str = "data/pipeline_runs.db"

    # Remotion playbook defaults — all configurable, no hardcoding in domain code
    playbook_default_fps: int = 30
    playbook_default_step_frames: int = 60
    playbook_composition_width: int = 960
    playbook_composition_height: int = 540

    # Export (Remotion render) — relative to repo root unless absolute
    export_web_app_dir: str = "apps/web"
    export_artifacts_dir: str = "data/exports"

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

    @field_validator("openai_timeout_s", mode="before")
    @classmethod
    def normalize_optional_timeout(cls, value: float | str | None) -> float | str | None:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

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
