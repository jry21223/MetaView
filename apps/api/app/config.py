from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.schemas import TopicDomain

DEFAULT_ENABLED_DOMAINS = ",".join(domain.value for domain in TopicDomain)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ALGO_VIS_",
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    app_name: str = "MetaView API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    default_provider: str | None = None
    default_router_provider: str | None = None
    default_generation_provider: str | None = None
    mock_provider_enabled: bool = True
    enabled_domains: str = DEFAULT_ENABLED_DOMAINS
    sandbox_timeout_ms: int = 1500
    max_repair_attempts: int = 2
    history_db_path: str = "data/pipeline_runs.db"
    preview_media_root: str = "data/media"
    preview_media_url_prefix: str = "/media"
    preview_video_enabled: bool = True
    preview_html_output_dir: str = "data/html_previews"
    preview_render_backend: str = "auto"
    render_runner: str = "local"
    gvisor_docker_binary: str = "docker"
    gvisor_runtime: str = "runsc"
    gvisor_image: str = "metaview-manim:latest"
    gvisor_network_enabled: bool = False
    gvisor_memory_limit_mb: int = 512
    gvisor_cpu_limit: str = "1.0"
    gvisor_pids_limit: int = 64
    preview_tts_enabled: bool = True
    preview_tts_backend: str = "openai_compatible"
    preview_tts_model: str = "mimotts-v2"
    preview_tts_base_url: str | None = None
    preview_tts_api_key: str | None = None
    preview_tts_voice: str = "default"
    preview_tts_rate_wpm: int = 150
    preview_tts_speed: float = 0.88
    preview_tts_max_chars: int = 1500
    preview_tts_timeout_s: float | None = 120.0
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
    openai_timeout_s: float | None = 300.0

    @field_validator(
        "preview_tts_timeout_s",
        "manim_render_timeout_s",
        "openai_timeout_s",
        mode="before",
    )
    @classmethod
    def normalize_optional_timeout(cls, value: float | str | None) -> float | str | None:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

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
