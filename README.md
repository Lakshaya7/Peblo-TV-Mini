# Peblo TV Mini Challenge

## Overview

This is a miniature of Peblo's streaming product surface. Peblo TV is our streaming mode: the content team uploads a show's episodes and artwork through an internal CMS, the backend builds a published catalogue file, and a viewer-facing UI reads that catalogue so a child can browse rows, search, and filter — Netflix-style.

The system has three layers:
1. **CMS (React)** — content managers upload shows, seasons, episodes, and artwork
2. **API (FastAPI + PostgreSQL)** — manages the data model, validation, and publish pipeline
3. **Viewer UI (React)** — reads the published catalogue and presents a Netflix-style browse experience

## Project Structure

```
peblo-tv-mini/
├── backend/          # FastAPI + PostgreSQL
├── cms/              # Internal React + TypeScript CMS
├── viewer/           # React + TypeScript viewer UI
├── docker-compose.yml       # Docker infrastructure
├── .env.example           # Environment variables
├── .github/workflows/ci.yml # CI/CD pipeline
└── README.md              # This file
```

## Part A — Backend (FastAPI + PostgreSQL)

### Schema & Migrations

The database uses SQLAlchemy 2.0 with Alembic migrations. The core schema consists of:

- **shows** — TV shows with name, description, section, and status (draft/published)
- **seasons** — seasons within a show, with a `is_trailer` flag (Season 0 = trailers, not shown in normal UI)
- **episodes** — episodes within a season, with title, description, duration (seconds), language, and `content_group` for language variants
- **artwork** — three sizes per episode: poster (2:3), banner (16:9), thumbnail (16:9), with 200 KB ceiling and dimension validation
- **publish_runs** — records of catalogue publish operations (who, when, counts, outcome)

Key constraints:
- `(content_group, language)` must be unique — episodes sharing one are language variants of the same episode
- A published show must have a section assigned
- An episode can't be published without artwork and a duration
- Season 0 (trailers) is reserved and doesn't appear as a normal season

### Artwork Upload Endpoint

POST `/admin/artwork/upload/` validates:
- File size ≤ 200 KB
- Aspect ratio within 10% of expected: poster ≈ 2:3 (600×900), banner ≈ 16:9 (1280×720), thumbnail ≈ 16:9 (640×360)
- Accepted formats: JPG, JPEG, PNG, WebP
- Rejects with editor-readable error messages

Storage is abstracted behind an interface (`LocalStorage` for development, `R2Storage` for Cloudflare R2 production). Swapping backends only requires changing the `STORAGE_BACKEND` env var and providing R2 credentials — no code changes to endpoints.

### CRUD & Validation

- Editor can CRUD shows/seasons/episodes with validation
- POST `/admin/catalog/publish/` builds the catalogue JSON atomically
- GET `/catalog` serves the published file
- GET `/catalog/search?q=&category=&language=&section=` — q matches show title, episode title, category; all filters compose
- GET `/admin/validation-report/` returns everything blocking publish, grouped for editors

### Roles

- **Editor**: CRUD operations on shows/seasons/episodes
- **Admin**: All editor capabilities + publish trigger
- Enforced at the endpoint level (simple inline auth for the challenge; production would use JWT)

### Atomic Publish

The publish endpoint writes to a temporary file then atomically renames it. If the process dies mid-publish, the live catalogue file is either the old version or the new version — never a partial write. The publish run is recorded in the `publish_runs` table with status, counts, and outcome.

### Tests

Tests cover the risky parts: artwork validation, publish job, search composition, and role enforcement.

## Part B — Internal CMS (React + TypeScript)

A content management interface for editors:

- **Show/episode list**: search, filters (section, status, language), pagination
- **Create/edit form**: three labelled artwork upload slots, each showing required dimensions, live preview, and human-readable errors
- **Publish page**: validation report, publish button disabled with reasons when blocked, run history
- **State handling**: loading, empty, error, and permission-denied states
- **TanStack Query**: used for server-state management (syncing with server, caching, background refetching)

Artwork upload slots show:
- Required dimensions and ratio explanation
- Live preview of selected image
- Real-time validation (size, dimensions, format)
- Human-readable error messages if validation fails

## Part C — Viewer Browse UI (React + TypeScript)

A separate app that reads only the published catalogue:

- **Netflix-style home**: featured hero banner + horizontal rows by section
  - Banner artwork for the hero surface
  - Poster artwork for row headers
  - Thumbnail artwork for episode lists
- **Search + filters**: category and language with sensible empty states
- **Show detail**: synopsis, seasons and episodes, language options for grouped episodes
- **Trailers (Season 0)**: don't appear as a normal season
- **Slow image handling**: images load with placeholder/blur-up technique, UI remains responsive

## Part D — Pipeline & Operability

### docker-compose up

`docker-compose up` brings up:
- **db** — PostgreSQL 16
- **api** — FastAPI application
- **cms** — React CMS application (port 3000)
- **viewer** — React viewer UI (port 3001)

All services are seeded and working. The backend connects to PostgreSQL using the `POSTGRES_DSN` environment variable.

### GitHub Actions CI

Workflow at `.github/workflows/ci.yml`:
- **Lint and test**: runs Python pytest against a Postgres service container
- **Build images**: builds Docker images for API, CMS, and viewer
- **Deploy step**: explained (push to registry, update compose) — doesn't deploy to real cloud

### Environment Variables

`.env.example` covers every variable:
- Database DSN, secret key, admin password
- Storage backend choice and R2 credentials (if using Cloudflare R2)
- A paragraph on secrets management: in production, use a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault) and inject via the platform's secret injection mechanism. Never hardcode credentials.

### Health Endpoint

GET `/health` returns `{"status": "ok"}`. Would alert on missed heartfalls and failed publish runs.

## Part E — Written Reasoning

### 1. Atomic Publishing

The publish endpoint writes the catalogue JSON to a temporary file (`catalogue.json.tmp`) then atomically renames it to `catalogue.json`. On Unix systems, `rename()` is atomic at the filesystem level — the old file is either fully visible or the new file is visible, never a partial mix. If the process dies mid-write:
- If it dies before `rename()`: the live `catalogue.json` is still the previous valid version; readers see stale but complete data
- If it dies after `rename()`: the new catalogue is fully visible; the old one is lost but the run is recorded as "completed" in `publish_runs`
- A production system would add a retry/idempotency mechanism: on startup, check if the last `publish_run` status was "failed" and re-run if the catalogue file is missing or incomplete

### 2. Storage Abstraction

The storage interface (`storage.py`) currently has two implementations:
- **LocalStorage**: reads/writes to `storage/` directory on disk, serves URLs like `/static/...`
- **R2Storage**: uses `boto3` to read/write Cloudflare R2, serves URLs like `https://<bucket>.r2.cloudfront.net/...`

To move from local disk to Cloudflare R2:
1. Set `STORAGE_BACKEND=r2` in `.env`
2. Provide `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`
3. No code changes to API endpoints — the same `upload()`, `delete()`, `get_url()` interface is used

Additional considerations for production:
- Set appropriate Cache-Control headers on R2 objects
- Use R2 Origin Bucket for custom domains
- Enable R2 logging for audit purposes
- Monitor R2 storage usage and set up alerts

### 3. Search Implementation

Search is implemented server-side using SQL `ILIKE` queries on show names, episode titles, and category. It works well for the current catalogue size (~95 episodes across 8 shows).

**Scale limit**: At approximately 10,000+ episodes, `ILIKE` with `%query%` becomes slow because it cannot use standard B-tree indexes effectively (leading wildcard makes the index unusable). At that scale, would transition to a dedicated search engine.

**Next step**: Integrate PostgreSQL Full-Text Search (`@@ to_tsquery`) for better performance on text matching, or migrate to Elasticsearch/Tantivy for large catalogues.

### 4. Pre-published Catalogue File vs. Per-Request DB Query

We serve a pre-published catalogue JSON file instead of querying the database per request for several reasons:

**Why pre-published:**
- Predictable performance: constant-time file read vs. variable DB query time
- Atomic snapshots: readers always see a consistent state; no concurrent modification issues
- Offload: the API can be scaled independently; the viewer can be served from CDN edges
- Offline: the catalogue can be served even if the database is temporarily unavailable

**Where this choice bites:**
- Delay between "un-publishing" content and it disappearing from the viewer (until next publish run)
- Extra step in the workflow: content must be published before viewers can see it
- Storage cost: keeping both the live catalogue and the database in sync
- Feature limitations: some complex queries (e.g., real-time filtering by dynamic attributes) are harder with a static file

The trade-off is acceptable for Peblo TV's use case: content is managed by a small team, and the publish cycle is under their control. For a platform with real-time user-generated content, a hybrid approach (pre-published for browse, database queries for admin actions) would be preferred.

### 5. What Was Left Out & Why

| Item | Reason |
|------|--------|
| Versioned catalogue with rollback | Time constraint; could be added by keeping previous `catalogue.json` files and adding a `version` field |
| Publish dry-run showing a diff | Would require a separate analysis step; not core to the challenge |
| Audit log of who changed what | The `publish_runs` table records who triggered publish, but per-change auditing was omitted for brevity |
| AI tool usage | Used FastAPI docs and SQLAlchemy ORM as development aids; all code reviewed and modified by hand to ensure correctness |

The core judgment of this challenge is: an honest, well-reasoned 70% implementation that correctly handles the data model, validation, and publish pipeline is worth more than a rushed 100% with broken validation or missing role enforcement.

## Scoring (100 points)

| Area | Points |
|------|--------|
| Upload & validation | 15 |
| Publish job — atomic, recorded, idempotent, language grouping correct | 20 |
| API design & auth — sensible resources, roles enforced, honest errors, filters compose | 15 |
| Data modelling — schema fits the queries, indexes justified, clean migrations | 10 |
| CMS usability — an editor could use it unaided, all states handled | 15 |
| Viewer UI — hero/rows/detail correct, right artwork per surface, search & filters, empty states | 10 |
| Pipeline & operability — compose works first try, CI meaningful, secrets & alerting reasoned | 10 |
| Written reasoning — real trade-offs | 5 |

## How to Run

### Option A — Docker (all services)

1. `docker-compose up --build` — brings up DB (PostgreSQL 16), API, CMS, Viewer. The backend runs a seed at startup so the viewer has content.
2. CMS: open http://localhost:3000, login with admin / admin123

   Login calls `POST /admin/login` and stores the returned bearer token in
   `localStorage` (`peblo_cms_token`); every `/admin/*` request sends it as
   `Authorization: Bearer <token>`. Endpoints return 401 (no token) or 403
   (invalid token), which the CMS surfaces as a permission-denied state.
3. Viewer: open http://localhost:3001
4. API: open http://localhost:8000/docs for interactive API documentation

### Option B — Local development (no Docker)

1. Backend (uses SQLite by default for local convenience):
   ```bash
   cd backend
   pip3 install --break-system-packages -r requirements.txt
   python3 -c "from backend.db import engine; from backend.models import Base; Base.metadata.create_all(engine)"
   # Seed 8 shows / ~96 canonical episodes (+ en/hi variants) with generated artwork:
   python3 -m backend.seed
   python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
2. CMS (http://localhost:5173, can proxy to the API):
   ```bash
   cd cms
   npm install
   npm run dev
   ```
   Login with admin / admin123.
3. Viewer (http://localhost:5174):
   ```bash
   cd viewer
   npm install
   npm run dev
   ```

### Workflow

1. In the CMS, create shows → seasons → episodes. Upload the three artwork sizes per episode (poster / banner / thumbnail). Each slot validates size (≤ 200 KB), format, and aspect ratio live.
2. Set a show's status to **published** (Edit → status) so it enters the catalogue.
3. Open **Publish** and check the validation report; once `publishable`, trigger the publish run. The catalogue is written atomically.
4. Open the Viewer (http://localhost:3001) to see the Netflix-style rows, hero banner, show detail pages, season tabs, language options for grouped episodes, trailers, and search/filter.

## Notes

- The seed data (`seed_shows.json`) was not provided directly; the challenge specifies 95 episode rows across 8 shows. The data model handles language grouping (`content_group`) for shipping English/Hindi variants.
- Artwork sizes: poster ~600×900 (2:3), banner ~1280×720 (16:9), thumbnail ~640×360 (16:9). All capped at 200 KB.
- Season 0 is reserved for trailers and is excluded from normal viewer rows.
- Content groups collapse language variants into one catalogue entry with a languages list.