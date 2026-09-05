import os
import uuid
from pathlib import Path
from typing import BinaryIO, Protocol, Optional

from fastapi import HTTPException, status
from .config import settings


class StorageInterface(Protocol):
    def upload(self, path: str, data: bytes) -> str:
        """Upload data to a path, return the public URL."""
        ...

    def delete(self, path: str) -> None:
        """Delete a file at path."""

    def get_url(self, path: str) -> str:
        """Get a public URL for a file."""


class LocalStorage:
    """Local disk storage backend, suitable for development and MinIO/S3 compatibility."""

    def __init__(self, base_dir: str = "storage") -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def upload(self, path: str, data: bytes) -> str:
        target = self.base_dir / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return f"/static/{path}"

    def delete(self, path: str) -> None:
        (self.base_dir / path).unlink(missing_ok=True)

    def get_url(self, path: str) -> str:
        return f"/static/{path}"


class R2Storage:
    """Cloudflare R2 storage backend."""

    def __init__(
        self,
        account_id: str,
        access_key: str,
        secret_key: str,
        bucket: str,
    ) -> None:
        import boto3

        self.client = boto3.client(
            "s3",
            endpoint_url="https://api.cloudflare.com/client/v4/",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        self.bucket = bucket

    def upload(self, path: str, data: bytes) -> str:
        import mimetypes

        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        key = path.lstrip("/")
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=mime)
        return f"https://{self.bucket}.r2.cloudfront.net/{key}"

    def delete(self, path: str) -> None:
        key = path.lstrip("/")
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def get_url(self, path: str) -> str:
        key = path.lstrip("/")
        return f"https://{self.bucket}.r2.cloudfront.net/{key}"


def get_storage() -> StorageInterface:
    """Get the configured storage backend."""
    if settings.storage_backend == "r2":
        if not settings.r2_access_key or not settings.r2_secret_key or not settings.r2_account_id:
            raise HTTPException(
                status_code=500,
                detail="R2 credentials not configured",
            )
        return R2Storage(
            account_id=settings.r2_account_id,
            access_key=settings.r2_access_key,
            secret_key=settings.r2_secret_key,
            bucket=settings.r2_bucket,
        )
    return LocalStorage(settings.storage_local_dir)