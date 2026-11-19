"""Central application settings, read once from the environment."""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.env = os.getenv("APP_ENV", "development")
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///./app.db")

        self.jwt_secret = os.getenv("JWT_SECRET", "change-this-super-secret")
        self.access_token_expire_hours = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "720"))

        self.openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.vision_model = os.getenv("OPENAI_VISION_MODEL", "gpt-4.1-mini")
        self.planner_model = os.getenv("OPENAI_PLANNER_MODEL", "gpt-4.1-mini")
        self.chat_model = os.getenv("OPENAI_CHAT_MODEL", self.planner_model)
        self.help_model = os.getenv("OPENAI_HELP_MODEL", "gpt-4.1-mini")

        self.tavily_api_key = os.getenv("TAVILY_API_KEY", "").strip()

        # YouTube Data API v3 (free key; default quota 10,000 units/day = ~100 searches)
        self.youtube_api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
        self.youtube_daily_search_limit = int(os.getenv("YOUTUBE_DAILY_SEARCH_LIMIT", "90"))

        origins = os.getenv("FRONTEND_URL", "http://localhost:5173")
        self.cors_origins = [o.strip().rstrip("/") for o in origins.split(",") if o.strip()]

        self.max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", "15"))
        self.ai_rate_limit_per_minute = int(os.getenv("AI_RATE_LIMIT_PER_MINUTE", "20"))
        self.auth_rate_limit_per_minute = int(os.getenv("AUTH_RATE_LIMIT_PER_MINUTE", "10"))
        self.help_rate_limit_per_minute = int(os.getenv("HELP_RATE_LIMIT_PER_MINUTE", "6"))
        self.help_daily_limit = int(os.getenv("HELP_DAILY_LIMIT", "60"))
        self.video_rate_limit_per_minute = int(os.getenv("VIDEO_RATE_LIMIT_PER_MINUTE", "20"))

        self.payments_enabled = _bool("PAYMENTS_ENABLED")

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

if settings.is_production and settings.jwt_secret == "change-this-super-secret":
    raise RuntimeError("Set a strong JWT_SECRET before running in production.")
