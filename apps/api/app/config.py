from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.schemas import ProviderName


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ALGO_VIS_", extra="ignore")

    app_name: str = "Algo Visual Platform API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    default_provider: ProviderName = ProviderName.MOCK
    sandbox_timeout_ms: int = 1500


@lru_cache
def get_settings() -> Settings:
    return Settings()
