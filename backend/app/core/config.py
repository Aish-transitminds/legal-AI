from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Legal Document Intelligence"
    app_env: str = "development"
    database_url: str = "sqlite:///./legal_ai.db"
    max_upload_size_mb: int = 15
    retention_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
