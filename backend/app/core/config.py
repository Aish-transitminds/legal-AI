import logging
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    app_name: str = "Legal Document Intelligence"
    app_env: str = "development"
    database_url: str = "sqlite:///./legal_ai.db"
    max_upload_size_mb: int = 15
    retention_days: int = 30
    llm_timeout_seconds: float = 45.0
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_api_key: str = ""
    openrouter_model: str = "deepseek/deepseek-v4-flash-0731:free"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    @field_validator("max_upload_size_mb")
    @classmethod
    def validate_max_upload_size(cls, v: int) -> int:
        if v < 1 or v > 50:
            raise ValueError("max_upload_size_mb must be between 1 and 50")
        return v

    @field_validator("llm_provider")
    @classmethod
    def validate_llm_provider(cls, v: str) -> str:
        allowed = {"ollama", "openrouter", "groq"}
        if v.lower() not in allowed:
            raise ValueError(f"llm_provider must be one of {allowed}")
        return v.lower()

    @field_validator("llm_timeout_seconds")
    @classmethod
    def validate_timeout(cls, v: float) -> float:
        if v < 5 or v > 300:
            raise ValueError("llm_timeout_seconds must be between 5 and 300")
        return v

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
