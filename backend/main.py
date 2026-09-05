import json
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_, desc

from .db import get_db, SessionLocal, engine
from .config import settings
from .models import Show, Season, Episode, Artwork, PublishRun, Base
from .schemas import (
    LoginRequest,
    ShowCreate, ShowUpdate, ShowOut,
    SeasonCreate, SeasonOut,
    EpisodeCreate, EpisodeUpdate, EpisodeOut,
    ArtworkUpload, ArtworkUpdate, ArtworkOut,
    FilterParams, SearchResult, PublishTrigger, PublishRunOut,
    ValidationIssue, ValidationReport,
)
from .storage import get_storage, StorageInterface
from .publish import build_catalogue

app = FastAPI(title="Peblo TV Mini API", version="1.0")
security = HTTPBearer()

# Serve uploaded artwork from local storage
STORAGE_DIR = Path(settings.storage_local_dir)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STORAGE_DIR)), name="static")

# Allow the CMS and Viewer (Vite dev servers) to call the API cross-origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth ────────────────────────────────────────────────────────────

ADMIN_CREDENTIALS = {"username": "admin", "password": settings.admin_password}


@app.post("/admin/login")
def admin_login(payload: LoginRequest):
    """Verify admin credentials and return a bearer token.

    The token is intentionally a simple static value (settings.admin_token);
    in production, replace this with a signed JWT.
    """
    if (
        payload.username == ADMIN_CREDENTIALS["username"]
        and payload.password == ADMIN_CREDENTIALS["password"]
    ):
        return {
            "access_token": settings.admin_token,
            "token_type": "bearer",
            "username": payload.username,
        }
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password",
    )


def get_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Require a valid admin bearer token for admin-only endpoints."""
    if credentials is not None and credentials.credentials == settings.admin_token:
        return "admin"
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin access required",
    )


# ─── Show CRUD ────────────────────────────────────────────────────────

@app.post("/admin/shows/", response_model=ShowOut)
def create_show(payload: ShowCreate, db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    """Editor can create shows."""
    show = Show(name=payload.name, description=payload.description, section=payload.section)
    db.add(show)
    db.commit()
    db.refresh(show)
    return show


@app.get("/admin/shows/", response_model=List[ShowOut])
def list_shows(db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    """Editors can list shows."""
    stmt = select(Show).order_by(Show.name)
    result = db.execute(stmt)
    return result.scalars().all()


@app.get("/admin/shows/{show_id}", response_model=ShowOut)
def get_show(show_id: int, db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    return show


@app.patch("/admin/shows/{show_id}", response_model=ShowOut)
def update_show(show_id: int, payload: ShowUpdate, db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(show, field, value)
    db.commit()
    db.refresh(show)
    return show


@app.delete("/admin/shows/{show_id}")
def delete_show(show_id: int, db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    """Delete a show and its associated seasons/episodes (cascade)."""
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    db.delete(show)
    db.commit()
    return {"detail": "Show deleted"}


# ─── Publish runs listing ─────────────────────────────────────────────

@app.get("/admin/publish-runs/", response_model=List[PublishRunOut])
def list_publish_runs(db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    """List the catalogue publish history, most recent first."""
    stmt = select(PublishRun).order_by(desc(PublishRun.run_at))
    result = db.execute(stmt)
    return result.scalars().all()



# ─── Season CRUD ──────────────────────────────────────────────────────

@app.post("/admin/shows/{show_id}/seasons/", response_model=SeasonOut)
def create_season(show_id: int, payload: SeasonCreate, db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    season = Season(show_id=show_id, number=payload.number, title=payload.title, is_trailer=payload.is_trailer)
    db.add(season)
    db.commit()
    db.refresh(season)
    return season


@app.get("/admin/shows/{show_id}/seasons/", response_model=List[SeasonOut])
def list_seasons(show_id: int, db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    stmt = select(Season).where(Season.show_id == show_id).order_by(Season.number)
    result = db.execute(stmt)
    return result.scalars().all()


# ─── Episode CRUD ─────────────────────────────────────────────────────

@app.post("/admin/shows/{show_id}/seasons/{season_id}/episodes/", response_model=EpisodeOut)
def create_episode(
    show_id: int, season_id: int, payload: EpisodeCreate,
    db: Session = Depends(get_db), _: str = Depends(get_admin_user),
):
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")

    season = db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    # Validate: content_group + language must be unique (only when grouped)
    if payload.content_group:
        existing = db.scalar(
            select(Episode).where(
                Episode.content_group == payload.content_group,
                Episode.language == payload.language,
            )
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Episode with content_group='{payload.content_group}' and language='{payload.language}' already exists",
            )

    episode = Episode(
        season_id=season_id if not payload.is_trailer else None,
        show_id=show_id,
        title=payload.title,
        description=payload.description,
        duration=payload.duration,
        language=payload.language,
        content_group=payload.content_group,
        is_trailer=payload.is_trailer,
    )
    db.add(episode)
    db.commit()
    db.refresh(episode)

    # Denormalize season_number / episode_number for easy querying
    if season:
        episode.season_number = season.number
        db.commit()

    return episode


@app.get("/admin/shows/{show_id}/seasons/{season_id}/episodes/", response_model=List[EpisodeOut])
def list_episodes(
    show_id: int, season_id: int,
    db: Session = Depends(get_db), _: str = Depends(get_admin_user),
):
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(status_code=404, detail="Show not found")
    stmt = select(Episode).where(Episode.season_id == season_id).order_by(Episode.episode_number)
    result = db.execute(stmt)
    return result.scalars().all()


@app.patch("/admin/shows/{show_id}/seasons/{season_id}/episodes/{episode_id}", response_model=EpisodeOut)
def update_episode(
    show_id: int, season_id: int, episode_id: int, payload: EpisodeUpdate,
    db: Session = Depends(get_db), _: str = Depends(get_admin_user),
):
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    if payload.content_group:
        # content_group + language must stay unique when grouped
        existing = db.scalar(
            select(Episode).where(
                Episode.content_group == payload.content_group,
                Episode.language == payload.language,
                Episode.id != episode_id,
            )
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Episode with content_group='{payload.content_group}' and language='{payload.language}' already exists",
            )

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(episode, field, value)
    db.commit()
    db.refresh(episode)
    return episode


@app.delete("/admin/shows/{show_id}/seasons/{season_id}/episodes/{episode_id}")
def delete_episode(
    show_id: int, season_id: int, episode_id: int,
    db: Session = Depends(get_db), _: str = Depends(get_admin_user),
):
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    # Cascade: remove linked artwork files + rows
    for art in db.scalars(select(Artwork).where(Artwork.episode_id == episode_id)).all():
        from .storage import get_storage
        get_storage().delete(art.path)
        db.delete(art)
    db.delete(episode)
    db.commit()
    return {"detail": f"Episode {episode_id} deleted"}


# ─── Artwork Upload ───────────────────────────────────────────────────

ALLOWED_SIZES = {
    "poster": (600, 900),   # ~2:3 ratio, tolerance allowed
    "banner": (1280, 720),  # 16:9
    "thumbnail": (640, 360),  # 16:9
}

MAX_SIZE_BYTES = 200 * 1024  # 200 KB


def validate_artwork_dimensions(kind: str, width: int, height: int) -> list[str]:
    """Validate aspect ratio and approximate dimensions for an artwork kind."""
    errors: list[str] = []
    expected_w, expected_h = ALLOWED_SIZES[kind]
    ratio_expected = expected_w / expected_h
    ratio_actual = width / height if height else 0

    # Check aspect ratio within 10% tolerance
    if abs(ratio_actual - ratio_expected) > ratio_expected * 0.1:
        errors.append(
            f"{kind}: expected aspect ratio ~{ratio_expected:.2f} ( {expected_w}x{expected_h} ), got {ratio_actual:.2f} ({width}x{height})"
        )

    # Check dimensions within reasonable range (±25%)
    if not (0.75 * expected_w <= width <= 1.25 * expected_w):
        errors.append(f"{kind}: width {width} is outside acceptable range ({int(0.75*expected_w)}-{int(1.25*expected_w)})")
    if not (0.75 * expected_h <= height <= 1.25 * expected_h):
        errors.append(f"{kind}: height {height} is outside acceptable range ({int(0.75*expected_h)}-{int(1.25*expected_h)})")

    return errors


@app.post("/admin/artwork/upload/", response_model=ArtworkOut)
def upload_artwork(
    payload: ArtworkUpload,
    db: Session = Depends(get_db),
    storage: StorageInterface = Depends(get_storage),
    _: str = Depends(get_admin_user),
):
    """Upload artwork for an episode or season. Validates size, dimensions, and 200KB ceiling."""
    from PIL import Image
    import io

    # Validate file size
    if len(payload.file) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large: {len(payload.file)} bytes (max {MAX_SIZE_BYTES} bytes / {MAX_SIZE_BYTES//1024} KB)",
        )

    # Validate dimensions using PIL
    try:
        img = Image.open(io.BytesIO(payload.file))
        width, height = img.size
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image file: {e}",
        )

    # Validate dimensions per kind
    dim_errors = validate_artwork_dimensions(payload.kind, width, height)
    if dim_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="; ".join(dim_errors),
        )

    # Store file
    ext = payload.original_filename.rsplit(".", 1)[-1].lower() if "." in payload.original_filename else "jpg"
    unique_filename = f"{uuid4()}.{ext}"
    store_path = f"artwork/{payload.kind}/{unique_filename}"

    url = storage.upload(store_path, payload.file)

    # Resolve the show_id if not provided
    resolved_show_id = payload.show_id
    if resolved_show_id is None and payload.season_id:
        season = db.get(Season, payload.season_id)
        resolved_show_id = season.show_id if season else None
    if resolved_show_id is None and payload.episode_id:
        episode = db.get(Episode, payload.episode_id)
        resolved_show_id = episode.show_id if episode else None

    # Record in DB
    artwork = Artwork(
        kind=payload.kind,
        width=width,
        height=height,
        size_bytes=len(payload.file),
        path=store_path,
        mime_type=img.format,
        episode_id=payload.episode_id,
        season_id=payload.season_id,
        show_id=resolved_show_id,
    )
    db.add(artwork)
    db.commit()
    db.refresh(artwork)

    return artwork


# ─── Search ────────────────────────────────────────────────────────────

@app.get("/catalog/search/", response_model=List[SearchResult])
def catalog_search(
    q: str = Query(default=None, description="Search term matching show title, episode title, or category"),
    category: str = Query(default=None, description="Filter by section/category"),
    language: str = Query(default=None, description="Filter by language"),
    section: str = Query(default=None, description="Filter by section"),
    db: Session = Depends(get_db),
):
    """Search across show titles, episode titles, and category. Filters compose."""
    # Join Episode with Show using show_id foreign key
    stmt = select(Episode).join(Show, Episode.show_id == Show.id)

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Show.name.ilike(like),
                Show.section.ilike(like),
                Episode.title.ilike(like),
            )
        )

    if category:
        stmt = stmt.where(Show.section.ilike(category))

    if language:
        stmt = stmt.where(Episode.language == language)

    if section:
        stmt = stmt.where(Show.section.ilike(section))

    stmt = stmt.distinct().order_by(desc(Episode.is_trailer), Episode.title)
    result = db.execute(stmt)
    episodes = result.scalars().all()

    out: List[SearchResult] = []
    for ep in episodes:
        out.append(
            SearchResult(
                show_id=ep.show_id,
                show_title=ep.show.name,
                episode_title=ep.title,
                category=ep.show.section,
                language=ep.language,
            )
        )
    return out


# ─── Catalogue / GET /catalog ─────────────────────────────────────────

@app.get("/catalog", response_class=FileResponse)
def get_catalogue(db: Session = Depends(get_db)):
    """Serve the published catalogue JSON file."""
    catalogue_path = Path("catalogue.json")
    if not catalogue_path.exists():
        build_catalogue(db)
        # After building, file should exist
    return FileResponse("catalogue.json", media_type="application/json")


# ─── Validation Report ────────────────────────────────────────────────

@app.get("/admin/validation-report/", response_model=ValidationReport)
def validation_report(db: Session = Depends(get_db), _: str = Depends(get_admin_user)):
    """Everything currently blocking publish, grouped for editors."""
    issues: List[ValidationIssue] = []

    # 1. Episodes without artwork (either episode or season artwork)
    from sqlalchemy import func as sa_func

    # Only episodes that will appear in the catalogue need artwork:
    #   - non-trailer episodes (trailers are excluded from normal rows and are
    #     not required to have artwork to publish)
    #   - for a content_group, only the representative (lowest id) language
    #     variant needs artwork — the others collapse into one entry
    ep_with_no_art = (
        db.execute(
            select(Episode.id)
            .outerjoin(Artwork, Episode.id == Artwork.episode_id)
            .where(
                Episode.is_trailer.is_(False),
                Episode.content_group.is_(None),
                Episode.show.has(Show.status == "published"),
            )
            .group_by(Episode.id)
            .having(sa_func.count(Artwork.id) == 0)
        )
        .scalars()
        .all()
    )
    for ep_id in ep_with_no_art:
        ep = db.get(Episode, ep_id)
        issues.append(
            ValidationIssue(
                category="missing_artwork",
                severity="blocking",
                count=1,
                detail=f"Episode '{ep.title}' (show '{ep.show.name}') has no artwork",
            )
        )

    # Content-grouped episodes: check the representative per group
    grouped_reps = db.execute(
        select(Episode.content_group, sa_func.min(Episode.id).label("rep_id"))
        .join(Show, Episode.show_id == Show.id)
        .where(
            Episode.content_group.isnot(None),
            Episode.is_trailer.is_(False),
            Show.status == "published",
        )
        .group_by(Episode.content_group)
    ).fetchall()
    for cg, rep_id in grouped_reps:
        rep = db.get(Episode, rep_id)
        has_art = db.scalar(
            select(Artwork.id)
            .where(Artwork.episode_id == rep.id)
            .limit(1)
        )
        if not has_art:
            issues.append(
                ValidationIssue(
                    category="missing_artwork",
                    severity="blocking",
                    count=1,
                    detail=f"Episode '{rep.title}' (show '{rep.show.name}') has no artwork",
                )
            )

    # 2. Episodes without duration
    episodes_no_dur = db.scalars(
        select(Episode).where(
            Episode.duration <= 0,
            Episode.is_trailer.is_(False),
        )
    ).all()
    for ep in episodes_no_dur:
        issues.append(
            ValidationIssue(
                category="duration_zero",
                severity="blocking",
                count=1,
                detail=f"Episode '{ep.title}' has no duration",
            )
        )

    # 3. Published shows must have a section (non-default/custom section check)
    published_shows = db.scalars(select(Show).where(Show.status == "published")).all()
    for ps in published_shows:
        if not ps.section:
            issues.append(
                ValidationIssue(
                    category="no_section",
                    severity="blocking",
                    count=1,
                    detail=f"Published show '{ps.name}' has no section assigned",
                )
            )

    # 4. Content group / language duplicates
    dup_stmt = (
        select(Episode.content_group, Episode.language, func.count().label("cnt"))
        .where(Episode.content_group.isnot(None))
        .group_by(Episode.content_group, Episode.language)
        .having(func.count() > 1)
    )
    duplicates = db.execute(dup_stmt).fetchall()
    for dg, dl, cnt in duplicates:
        issues.append(
            ValidationIssue(
                category="duplicate_group_lang",
                severity="blocking",
                count=int(cnt),
                detail=f"Content group '{dg}' has multiple episodes with language '{dl}'",
            )
        )

    publishable = len([i for i in issues if i.severity == "blocking"]) == 0
    return ValidationReport(issues=issues, publishable=publishable)


# ─── Publish Job ──────────────────────────────────────────────────────


def _atomic_write_catalogue(catalogue: dict) -> None:
    """Write the catalogue JSON atomically: temp file + rename.

    Readers opening catalogue.json always see a complete file — either the
    previous version or the new one, never a partial write.
    """
    catalogue_path = Path("catalogue.json")
    temp_path = Path("catalogue.json.tmp")

    def datetime_serializer(obj):
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    with open(temp_path, "w") as f:
        json.dump(catalogue, f, indent=2, default=datetime_serializer)
    temp_path.rename(catalogue_path)


@app.post("/admin/catalog/publish/", response_model=PublishRunOut)
def publish_catalog(
    trigger: PublishTrigger,
    db: Session = Depends(get_db),
    storage: StorageInterface = Depends(get_storage),
    _: str = Depends(get_admin_user),
):
    """Build the catalogue JSON and write it atomically."""
    catalogue = build_catalogue(db)

    # Record starting run
    run = PublishRun(
        run_by=trigger.run_by,
        status="running",
        total_shows=0,
        total_episodes=0,
        total_artwork=0,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Write catalogue atomically: write to temp file, then rename
    try:
        _atomic_write_catalogue(catalogue)

        # Update run
        run.status = "completed"
        run.total_shows = catalogue["metadata"]["total_shows"]
        run.total_episodes = catalogue["metadata"]["total_episodes"]
        run.total_artwork = catalogue["metadata"]["total_artwork"]
        run.catalogue_path = "catalogue.json"
        run.completed_at = func.now()
        db.commit()

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        db.commit()
        temp_path.unlink(missing_ok=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Publish failed: {e}", "run": {
                "id": run.id,
                "run_by": run.run_by,
                "run_at": str(run.run_at) if run.run_at else None,
                "status": run.status,
                "total_shows": run.total_shows,
                "total_episodes": run.total_episodes,
                "total_artwork": run.total_artwork,
                "catalogue_path": run.catalogue_path,
                "error_message": run.error_message,
                "completed_at": str(run.completed_at) if run.completed_at else None,
            }},
        )

    return {
        "id": run.id,
        "run_by": run.run_by,
        "run_at": str(run.run_at) if run.run_at else None,
        "status": run.status,
        "total_shows": run.total_shows,
        "total_episodes": run.total_episodes,
        "total_artwork": run.total_artwork,
        "catalogue_path": run.catalogue_path,
        "error_message": run.error_message,
        "completed_at": str(run.completed_at) if run.completed_at else None,
    }


# ─── Health ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ─── Startup: create tables + seed ──────────────────────────────────

@app.on_event("startup")
def on_startup():
    # Ensure storage directory exists
    import os
    os.makedirs(settings.storage_local_dir, exist_ok=True)
    os.makedirs("catalogue", exist_ok=True)
    Base.metadata.create_all(engine)
    _seed_if_empty()
    _ensure_catalogue()


def _ensure_catalogue():
    """Regenerate the published catalogue file at startup.

    The DB volume survives container recreation but catalogue.json lives in
    the (ephemeral) container layer, so we rebuild it on every boot using
    the same atomic write the publish endpoint uses. Cheap for small
    catalogues and keeps GET /catalog working even after recreate/rollback.
    """
    with SessionLocal() as db:
        try:
            _atomic_write_catalogue(build_catalogue(db))
        except Exception:
            # Don't crash a fresh container without a reachable DB yet;
            # the endpoint will surface real errors on publish.
            pass


def _seed_if_empty():
    """Seed demo content on first start so the viewer isn't blank.

    Only runs when the shows table is empty, so it's idempotent across
    restarts (set PEBLO_SEED_ON_STARTUP=false to skip).
    """
    if not settings.seed_on_startup:
        return
    with SessionLocal() as db:
        count = db.execute(select(func.count()).select_from(Show)).scalar()
        if count and count > 0:
            return
    from .seed import seed
    seed()