# Peblo TV Mini

Peblo TV Mini is a miniature of Peblo's streaming product: an internal CMS uploads shows, episodes, and artwork; the backend validates and publishes an atomic catalogue; and a viewer UI lets a child browse rows, search, and filter — Netflix-style.

```
CMS (React) ──► API (FastAPI + PostgreSQL) ──► publish job ──► catalogue.json (atomic)
                                                                        │
                                  Viewer UI (React) ◄────────────────────┘
```

- **Backend** — FastAPI + SQLAlchemy + PostgreSQL 16 (`backend/`)
- **CMS** — React + TypeScript + TanStack Query + Vite (`cms/`)
- **Viewer** — React + TypeScript + TanStack Query + Vite (`viewer/`)
- **Pipeline** — Docker Compose, GitHub Actions CI/CD, `.env.example`

## Quick Start

### Docker (recommended — full stack, PostgreSQL)

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| CMS | http://localhost:3000 — login `admin` / `admin123` |
| Viewer | http://localhost:3001 |
| API | http://localhost:8000/docs (interactive OpenAPI docs) |
| Health check | http://localhost:8000/health |

On first boot the API creates the schema and seeds demo content (8 shows, 192 episode rows with English/Hindi variants, 8 trailers, 288 artwork items) — only when the database is empty, so restarts never duplicate data. The published catalogue is regenerated atomically on every start, so `GET /catalog` always serves a valid snapshot, even after a container recreate.

> Requires Docker Desktop / Docker Engine. Tested with `docker compose` (Compose v2).

### Local development (no Docker)

```bash
# Backend — SQLite by default for a zero-setup local dev loop
cd backend
pip3 install --break-system-packages -r requirements.txt
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# CMS → http://localhost:5173 (login admin / admin123)
cd cms && npm install && npm run dev

# Viewer → http://localhost:5174
cd viewer && npm install && npm run dev
```

Startup auto-creates the schema and seeds on an empty DB, so there are no manual migration or seed steps.

## The Content Workflow

1. **CMS → Shows**: create, search, filter, paginate; set a show to `published` when ready.
2. **Show detail**: add seasons and episodes; upload the three artwork sizes per episode.
3. **Publish**: review the validation report, resolve anything blocking, run the publish, review run history.
4. **Viewer**: browse the hero + rows by section, search and filter, open a show detail page with season tabs, per-episode language options, and a dedicated trailers section.

## Feature Highlights

### Content management (CMS)
- Shows list with search, filters (section / status), pagination, create / edit / delete.
- Episode form with **three labelled artwork slots** (poster, banner, thumbnail). Each slot shows the required dimensions, a live preview, and live validation (size ≤ 200 KB, format, aspect ratio) before anything reaches the server.
- Publishing page: grouped validation report, a publish action **disabled with reasons** while the catalogue isn't clean, and a full publish-run history.
- Every screen handles loading, empty, error, and permission-denied states.
- TanStack Query for reliable server-state management.

### Artwork upload & validation (backend)
- Server-side validation with Pillow — never client-side only:
  - Poster 2:3 ≈ 600×900, banner 16:9 ≈ 1280×720, thumbnail 16:9 ≈ 640×360, with sensible ratio/dimension tolerance.
  - Hard ceiling of **200 KB**; JPG/JPEG/PNG/WebP.
- Errors are written for the editor, not an engineer (e.g. *"width 480 is outside acceptable range 450–750"*).
- Storage sits behind a clean interface (`StorageInterface`) with a local-disk backend for development and a Cloudflare R2 backend for production — swapping is a configuration change, not a code change.

### Publishing pipeline (backend)
- `POST /admin/catalog/publish` builds the catalogue from the database:
  - only **published** shows/episodes appear;
  - `content_group` language variants collapse into a single entry with a `languages` list;
  - grouped by section with deterministic ordering; trailers collected separately;
  - every run is recorded (who, when, counts, completed/failed + error).
- **Atomic by design**: serialised to a temp file, then atomically renamed — a reader never sees a half-written catalogue.
- `GET /catalog` serves the published file; `GET /catalog/search` is a **server-side** search.

### Search
- `GET /catalog/search?q=&category=&language=&section=` — `q` matches show title, episode title, and category; `category`, `language`, and `section` filters compose with it.
- Implemented in SQL over PostgreSQL, so results are quick and consistent for catalogues far beyond the seed size.

### Auth & access control
- All `/admin/*` endpoints are genuinely protected: no token → `401`, invalid token → `403`, and the CMS surfaces a clear permission-denied state.
- `POST /admin/login` returns a bearer token; the CMS stores it and attaches it to every request.

### Viewer experience
- Netflix-style home: hero banner (banner artwork) + horizontal rows per section (poster artwork).
- Search + filters (category, language) with a friendly empty state.
- Show detail page: synopsis, banner, season tabs, episode lists with thumbnails, and language options for grouped episodes.
- Trailers (Season 0) render in their own section — never as a normal season.
- Slow-network friendly: blur-up placeholder images with lazy loading and a smooth fade-in.

## Architecture & Data Model

```
shows 1 ─ n seasons 1 ─ n episodes   (content_group + language = unique)
  │                              │
  └────── section ───────────────┤
                   artwork (poster/banner/thumbnail → shows/episodes/seasons)
                   publish_runs (audit of every catalogue publication)
```

- **shows** — name, description, section, status (`draft` / `published`).
- **seasons** — number, title, `is_trailer` (Season 0 is reserved for trailers).
- **episodes** — title, description, duration (seconds), language, `content_group` for language variants.
- **artwork** — the three sized assets per episode/season with 200 KB ceiling.
- **publish_runs** — who triggered each publication, when, counts, and outcome.

Validation rules enforced by the model and the API:
- `(content_group, language)` is unique.
- A published show must have a section.
- An episode cannot reach the catalogue without artwork and a duration.
- Season 0 (trailers) never appears as a regular season.

## Pipeline & Operability

### Docker Compose
`docker compose up --build` runs four services with proper health checks and startup ordering: `db` (PostgreSQL 16, healthchecked), `api` (healthcheck on `/health`, waits for Postgres), `cms` and `viewer` (nginx-served SPAs). Configuration is injected through environment variables.

### CI/CD (GitHub Actions)
- **Lint & test**: backend pytest against a PostgreSQL service container + TypeScript typecheck and Oxlint for both frontends.
- **Build & publish**: production image builds for the API, CMS, and Viewer; the deploy step uses immutable image tags (git SHA) and a clean `docker compose pull && docker compose up -d` rollout on the host.

### Secrets management
`.env.example` documents every variable (`PEBLO_POSTGRES_DSN`, `PEBLO_SECRET_KEY`, `PEBLO_ADMIN_PASSWORD`, `PEBLO_STORAGE_BACKEND`, `PEBLO_STORAGE_LOCAL_DIR`, `PEBLO_SEED_ON_STARTUP`, R2 credentials). Secrets are never committed — in production they are injected from the platform's secrets manager (CI/cloud provider secrets) at runtime.

### Health & alerting
`GET /health` provides liveness and is wired into the orchestrator's health checks. The primary monitoring signal is **publish-run health**: a failed or stale publish is the point where the viewer could silently diverge from what content believes is live, so we alert on any `failed` publish run and on staleness (no successful publish in N hours).

## API Reference

Public (viewer-facing):
- `GET /health`
- `GET /catalog`
- `GET /catalog/search?q=&category=&language=&section=`

Admin (bearer-token protected — received from `POST /admin/login`):
- `POST /admin/login`
- `POST` / `GET /admin/shows/` · `GET` / `PATCH` / `DELETE /admin/shows/{id}`
- `POST` / `GET .../seasons/` · `POST` / `GET` / `PATCH` / `DELETE .../episodes/`
- `POST /admin/artwork/upload/`
- `GET /admin/validation-report/` · `POST /admin/catalog/publish/` · `GET /admin/publish-runs/`

## Design Decisions

- **Why a pre-published catalogue file instead of per-request DB queries?** The viewer gets a consistent snapshot (drafts never leak), a file read outperforms a per-request aggregation, and the catalogue can be cached at the CDN/edge. The trade-off is that content changes appear after the next publish run — the intended editorial gate, not a bug.
- **Atomic publication.** Temp-file + rename means readers always see a complete file; if a publish dies mid-way, the previous catalogue stays live and the run is recorded as failed for operators.
- **Language grouping.** `content_group` episodes collapse into one catalogue entry exposing its available languages — the mechanism Peblo uses to ship English/Hindi from a single editorial row.
- **Storage abstraction.** Local disk in dev, Cloudflare R2 in production, with one interface and a config switch between them.
- **Server-side search.** SQL/PostgreSQL search keeps the viewer light and consistent; moving the catalogue into the tens of thousands of entries calls for PostgreSQL full-text (GIN) or a dedicated search index.

## Roadmap

Planned hardening for a production rollout (out of scope for this build, intentionally):
- Alembic database migrations versioned with the repo.
- Granular roles (`editor` CRUD vs `admin` publish) backed by a permissions store.
- Versioned catalogue snapshots with rollback to a previous publish run.
- Publish dry-run that previews the diff before committing.
- Change-level audit log for every edit.
- Public catalogue URLs from R2/CDN instead of local disk.

## Notes

- Default login: `admin` / `admin123`.
- `catalogue.json`, `storage/`, `*.db`, and `node_modules/` are generated at runtime and kept out of version control.
- Artwork specs: poster 2:3 (~600×900), banner 16:9 (~1280×720), thumbnail 16:9 (~640×360), ≤ 200 KB, JPG/JPEG/PNG/WebP.
- Season 0 = trailers; `content_group` episodes collapse into one catalogue entry with a `languages` list.