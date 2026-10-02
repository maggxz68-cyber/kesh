"""Конфигурация приложения (pydantic-settings). Все секреты — только из окружения/.env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Family Finance Tracker"
    app_env: str = "development"
    tz: str = "Europe/Moscow"
    domain: str = "localhost"
    cors_origins: str = "http://localhost:5173"

    # Database
    database_url: str = "postgresql+asyncpg://ffuser:CHANGE_ME@localhost:5432/family_finance"

    # Auth
    jwt_secret: str = "CHANGE_ME"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30
    cookie_secure: bool = False
    cookie_domain: str = ""

    # Superadmin seed
    superadmin_login: str = "admin"
    superadmin_password: str = "1968"
    superadmin_force_password_change: bool = False

    # Demo
    demo_mode: bool = True
    sandbox_ttl_hours: int = 24
    demo_reset_enabled: bool = True

    # Files
    receipts_dir: str = "/data/receipts"
    max_upload_mb: int = 10

    # Rate limits
    rate_limit_login: str = "10/minute"
    rate_limit_demo: str = "5/minute"
    rate_limit_upload: str = "20/minute"

    # SMTP
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@example.com"
    smtp_tls: bool = True

    # ФНС
    fns_check_api_url: str = "https://prochecksum.gov.ru/checkstatus"
    fns_check_api_key: str = ""

    # Logging
    log_path: str = "backend.log"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
