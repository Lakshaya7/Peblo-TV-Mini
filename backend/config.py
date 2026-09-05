import os

from pydantic import BaseModel, Field, SecretStr
from typing import Literal, Optional

ENV_PREFIX = "PEBLO_"


def _env(name: str, default: str = "") -> str:
    return os.getenv(f"{ENV_PREFIX}{name}", default)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(f"{ENV_PREFIX}{name}")
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class Settings(BaseModel):
    postgres_dsn: str = Field(
        default="sqlite:///./peblo_tv_mini.db",
        description="PostgreSQL or SQLite DSN",
    )
    secret_key: str = Field(
        default="change-me-dev",
        description="Secret key for JWT",
    )
    admin_password: str = Field(
        default="admin123",
        description="Admin password for CMS login",
    )
    admin_token: str = Field(
        default="admin",
        description="Bearer token returned by login and required by /admin/* endpoints",
    )
    storage_backend: str = Field(
        default="local",
        description="Storage backend: local or r2",
    )
    storage_local_dir: str = Field(
        default="storage",
        description="Local directory used by the local storage backend",
    )
    seed_on_startup: bool = Field(
        default=True,
        description="Seed demo content on first startup if the DB is empty",
    )
    r2_account_id: Optional[SecretStr] = Field(
        default=None,
        description="Cloudflare R2 account ID",
    )
    r2_access_key: Optional[SecretStr] = Field(
        default=None,
        description="Cloudflare R2 access key",
    )
    r2_secret_key: Optional[SecretStr] = Field(
        default=None,
        description="Cloudflare R2 secret key",
    )
    r2_bucket: str = Field(
        default="peblo-tv",
        description="R2 bucket name",
    )
    r2_endpoint: str = Field(
        default="https://api.cloudflare.com/client/v4/",
        description="R2 endpoint URL",
    )


def _secret(name: str) -> Optional[SecretStr]:
    raw = os.getenv(f"{ENV_PREFIX}{name}")
    return SecretStr(raw) if raw else None


def load_settings() -> Settings:
    return Settings(
        postgres_dsn=_env("POSTGRES_DSN", "sqlite:///./peblo_tv_mini.db"),
        secret_key=_env("SECRET_KEY", "change-me-dev"),
        admin_password=_env("ADMIN_PASSWORD", "admin123"),
        admin_token=_env("ADMIN_TOKEN", "admin"),
        storage_backend=_env("STORAGE_BACKEND", "local"),
        storage_local_dir=_env("STORAGE_LOCAL_DIR", "storage"),
        seed_on_startup=_env_bool("SEED_ON_STARTUP", True),
        r2_account_id=_secret("R2_ACCOUNT_ID"),
        r2_access_key=_secret("R2_ACCESS_KEY"),
        r2_secret_key=_secret("R2_SECRET_KEY"),
        r2_bucket=_env("R2_BUCKET", "peblo-tv"),
        r2_endpoint=_env("R2_ENDPOINT", "https://api.cloudflare.com/client/v4/"),
    )


settings = load_settings()