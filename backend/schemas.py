from typing import List, Optional
import base64

from pydantic import BaseModel, Field, validator, field_validator
from datetime import datetime


# ── Auth ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=100)


# ── Shows / Seasons / Episodes ───────────────────────────────────────

class ShowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    section: str = Field(default="General", max_length=100)


class ShowUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    section: Optional[str] = Field(default=None, max_length=100)
    status: Optional[str] = Field(default=None, max_length=20)


class ShowOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    section: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Seasons ──────────────────────────────────────────────────────────

class SeasonCreate(BaseModel):
    number: int = Field(gt=0)
    title: Optional[str] = Field(default=None, max_length=200)
    is_trailer: bool = Field(default=False)


class SeasonOut(BaseModel):
    id: int
    show_id: int
    number: int
    title: Optional[str]
    is_trailer: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Episodes ─────────────────────────────────────────────────────────

class EpisodeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    duration: int = Field(gt=0)  # seconds
    language: str = Field(default="en", max_length=10)
    content_group: Optional[str] = Field(default=None, max_length=100)
    is_trailer: bool = Field(default=False)


class EpisodeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    duration: Optional[int] = Field(default=None, gt=0)
    language: Optional[str] = Field(default=None, max_length=10)
    content_group: Optional[str] = Field(default=None, max_length=100)
    is_trailer: Optional[bool] = Field(default=None)


class EpisodeOut(BaseModel):
    id: int
    season_id: Optional[int]
    show_id: int
    title: str
    description: Optional[str]
    duration: int
    language: str
    content_group: Optional[str]
    is_trailer: bool
    season_number: Optional[int]
    episode_number: Optional[int]

    class Config:
        from_attributes = True


# ── Artwork ──────────────────────────────────────────────────────────

class ArtworkUpload(BaseModel):
    kind: str = Field(..., pattern="^(poster|banner|thumbnail)$")
    file: bytes = Field(..., description="Base64-encoded raw image bytes")
    original_filename: str = Field(..., min_length=1)
    episode_id: Optional[int] = Field(default=None, description="Episode the artwork belongs to")
    season_id: Optional[int] = Field(default=None, description="Season the artwork belongs to")
    show_id: Optional[int] = Field(default=None, description="Show the artwork belongs to")

    @field_validator("file", mode="before")
    @classmethod
    def decode_base64(cls, v):
        """The CMS sends artwork over JSON as base64; decode it here."""
        if isinstance(v, str):
            try:
                return base64.b64decode(v)
            except Exception as exc:
                raise ValueError(f"file must be valid base64: {exc}")
        return v

    @validator("kind")
    def kind_must_be_valid(cls, v):
        if v not in ("poster", "banner", "thumbnail"):
            raise ValueError("kind must be one of: poster, banner, thumbnail")
        return v

    @validator("episode_id", pre=True, always=True)
    def validate_target(cls, v, values):
        """episode_id OR season_id must be set, not both."""
        season_id = values.get("season_id")
        if v and season_id:
            raise ValueError("episode_id and season_id cannot both be set")
        if v is None and season_id is None:
            raise ValueError("one of episode_id or season_id is required")
        return v

    @validator("original_filename")
    def filename_must_be_image(cls, v):
        ext = v.lower().rsplit(".", 1)[-1] if "." in v else ""
        if ext not in {"jpg", "jpeg", "png", "webp"}:
            raise ValueError("filename must have an image extension: jpg, jpeg, png, webp")
        return v


class ArtworkUpdate(BaseModel):
    kind: Optional[str] = Field(default=None, pattern="^(poster|banner|thumbnail)$")


class ArtworkOut(BaseModel):
    id: int
    episode_id: Optional[int]
    season_id: Optional[int]
    show_id: int
    kind: str
    width: int
    height: int
    size_bytes: int
    path: str
    mime_type: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Filters / Search ─────────────────────────────────────────────────

class FilterParams(BaseModel):
    q: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = Field(default=None, max_length=100)
    language: Optional[str] = Field(default=None, max_length=10)
    section: Optional[str] = Field(default=None, max_length=100)


class SearchResult(BaseModel):
    show_id: int
    show_title: str
    episode_title: str
    category: Optional[str]
    language: str


# ── Publish ──────────────────────────────────────────────────────────

class PublishTrigger(BaseModel):
    run_by: str = Field(..., min_length=1, max_length=200)


class PublishRunOut(BaseModel):
    id: int
    run_by: str
    run_at: datetime
    status: str
    total_shows: int
    total_episodes: int
    total_artwork: int
    catalogue_path: Optional[str]
    error_message: Optional[str]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Validation Report ────────────────────────────────────────────────

class ValidationIssue(BaseModel):
    category: str  # e.g. "missing_artwork", "no_section", "duration_zero", "duplicate_group_lang"
    severity: str  # "blocking" | "warning"
    count: int
    detail: str  # human-readable description


class ValidationReport(BaseModel):
    issues: List[ValidationIssue]
    publishable: bool