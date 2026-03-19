from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.schemas import TopicDomain


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ALGO_VIS_", extra="ignore")

    app_name: str = "MetaView API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    default_provider: str = "mock"
    default_router_provider: str | None = None
    default_generation_provider: str | None = None
    enabled_domains: str = "algorithm,math,code"
    sandbox_timeout_ms: int = 1500
    max_repair_attempts: int = 2
    history_db_path: str = "data/pipeline_runs.db"
    preview_media_root: str = "data/media"
    preview_media_url_prefix: str = "/media"
    preview_video_enabled: bool = True
    preview_render_backend: str = "auto"
    manim_python_path: str = ".venv-manim/bin/python"
    manim_cli_module: str = "manim"
    manim_quality: str = "l"
    manim_format: str = "mp4"
    manim_disable_caching: bool = True
    manim_render_timeout_s: float | None = 180.0
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str | None = None
    openai_router_model: str | None = None
    openai_planning_model: str | None = None
    openai_coding_model: str | None = None
    openai_critic_model: str | None = None
    openai_test_model: str | None = None
    openai_supports_vision: bool = False
    openai_timeout_s: float | None = None

    @property
    def enabled_topic_domains(self) -> tuple[TopicDomain, ...]:
        enabled: list[TopicDomain] = []
        for item in self.enabled_domains.split(","):
            value = item.strip().lower()
            if not value:
                continue
            enabled.append(TopicDomain(value))
        return tuple(enabled)


@lru_cache
def get_settings() -> Settings:
    return Settings()
