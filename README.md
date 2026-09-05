# Peblo TV Mini

Take-home challenge — *CMS upload → published catalogue → Netflix-style browse*.

A miniature of Peblo's streaming product: a content team uploads shows, episodes, and artwork through an **internal CMS**; the backend validates, then **publishes an atomic catalogue file**; and a **viewer UI** reads that catalogue so a child can browse rows, search, and filter.

```
CMS (React) ──► API (FastAPI + PostgreSQL) ──► publish job ──► catalogue.json (atomic)
                                                                        │
                                  Viewer UI (React) ◄────────────────────┘
```

- Backend: **FastAPI + SQLAlchemy + PostgreSQL 16** (`backend/`)
- CMS: **React + TypeScript + TanStack Query + Vite** (`cms/`, port 3000)
- Viewer: **React + TypeScript + TanStack Query + Vite** (`viewer/`, port 3001)
- Pipeline: **Docker Compose**, **GitHub Actions**, `.env.example`

## Quick Start

### Option A — Docker (everything, Postgres)

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| CMS | http://localhost:3000 (login `admin` / `admin123`) |
| Viewer | http://localhost:3001 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |

On first start the API creates the schema and seeds demo content (8 shows, 192 episode rows with English/Hindi variants, 8 trailers, 288 artwork items) only when the DB is empty — restart-safe, no duplicate seeding. The published catalogue file is regenerated atomically on every start (Postgres persists across container recreation, but the file lives in the container layer), so `GET /catalog` always works even after `docker compose up --force-recreate`.

### Option B — Local, no Docker

```bash
# Backend (SQLite by default for local convenience)
cd backend
pip3 install --break-system-packages -r requirements.txt
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# CMS → http://localhost:5173 (login admin / admin123)
cd cms && npm install && npm run dev

# Viewer → http://localhost:5174
cd viewer && npm install && npm run dev
```

Startup auto-creates tables and seeds on an empty DB, so no manual migration/seed step is required.

### Workflow

1. CMS → **Shows**: create / search / filter / paginate, set status to `published`.
2. Show detail → add **seasons** and **episodes**; upload the three artwork sizes per episode.
3. **Publish** page: read the validation report, fix anything blocking, trigger the publish run, see run history.
4. **Viewer**: hero banner + rows by section, search + filters, show detail with season tabs, language options for grouped episodes, and trailers (Season 0) shown outside the normal seasons.

## API

Public (used by the viewer):
- `GET /health` — liveness
- `GET /catalog` — the published catalogue
- `GET /catalog/search?q=&category=&language=&section=` — server-side search

Admin (require `Authorization: Bearer <token>` from `POST /admin/login`):
- `POST /admin/login` — returns a bearer token (`admin` / `admin123`)
- `POST/GET /admin/shows/`, `GET/PATCH/DELETE /admin/shows/{id}`
- `POST/GET .../seasons/`, `POST/GET/PATCH/DELETE .../episodes/`
- `POST /admin/artwork/upload/`
- `GET /admin/validation-report/`, `POST /admin/catalog/publish/`, `GET /admin/publish-runs/`

## Part A — Backend

### Data model & schema
`shows → seasons → episodes`, plus `artwork` and `publish_runs`. Constraints:
- `(content_group, language)` is unique — episodes sharing a `content_group` are language variants of the *same* episode.
- A published show must have a `section`.
- An episode can't reach the catalogue without artwork and a duration (artwork is enforced per content-group/language at validation time).
- Season 0 (`is_trailer`) is reserved for trailers and never rendered as a normal season.

Schema is created idempotently at startup (`Base.metadata.create_all`). Alembic migrations are intentionally **not** included — see Part E (what was left out). The index on `(content_group, language)` backs the uniqueness check and the language-grouping query.

### Artwork upload
`POST /admin/artwork/upload/` validates server-side (Pillow):
- Sizes: poster 2:3 ≈ 600×900, banner 16:9 ≈ 1280×720, thumbnail 16:9 ≈ 640×360, with ratio + dimension tolerance.
- Hard ceiling **200 KB**, formats JPG/JPEG/PNG/WebP.
- Errors are human-readable ("width 480 is outside acceptable range 450–750") so an editor can act without an engineer. The CMS mirrors this validation live with more precise messages.

Storage is behind `StorageInterface` (`backend/storage.py`): `LocalStorage` (dev) and `R2Storage` (Cloudflare R2 via boto3). Swapping backends is a config change (`PEBLO_STORAGE_BACKEND=local|r2` + R2 credentials), no endpoint changes.

### Publish job
`POST /admin/catalog/publish/`:
- Only **published** shows and non-trailer episodes appear; `content_group` variants collapse into **one entry with a `languages` list**; grouped by section with deterministic ordering; trailers are collected under `section.trailers`.
- The run is recorded in `publish_runs` (who, when, counts, completed/failed + error message).
- **Atomic**: JSON is written to `catalogue.json.tmp` and then `os.rename`d over `catalogue.json` — see Part E.1. The file is also rebuilt on startup (same atomic path) so it survives container recreation.

### Search
`GET /catalog/search` — server-side SQL over Postgres. `q` matches **show title, episode title, and category/section**; `category`, `language`, `section` filters compose with it. See Part E.3 for scale.

### Validation report
`GET /admin/validation-report` — one row per *category* of blocking/warning issue (missing artwork, missing section, zero duration, duplicate `(content_group, language)`), grouped so an editor can fix things top-down, with `publishable` computed. Trailer episodes and non-representative language variants are validated sensibly (representative episode per content group must have artwork).

### Auth & roles
All `/admin/*` endpoints are genuinely enforced: no token → `401`, wrong token → `403`. The CMS recognizes both and shows a permission-denied state. **Deliberate simplification:** a single `admin` role (token from `POST /admin/login`) covers CRUD *and* publish; the declared `editor` (CRUD-only) vs `admin` (+publish) split is documented but not implemented as separate credentials — see Part E.5.

### Tests
`backend/tests/` (11 tests) cover the risky bits: auth (login, 401/403, public vs admin), artwork rejection/acceptance, show/season/episode CRUD including episode PATCH/DELETE, search, and category matching. Tests run against their own throwaway DB, never the dev DB.

## Part B — CMS

- **Shows list**: search, filters (section/status), pagination, create/edit/delete with confirmation, loading / empty / error / **permission-denied** states.
- **Show detail**: seasons + episodes, create-season.
- **Episode form**: three labelled artwork slots (poster/banner/thumbnail), each showing required dimensions, a live preview, and live validation (size ≤ 200 KB, format, aspect ratio) before upload; server errors surface too.
- **Publish page**: grouped validation report, a publish button **disabled with reasons** when blocking issues exist, and publish-run history table.
- **Login**: `POST /admin/login` → bearer token stored in `localStorage`, attached to every request.
- TanStack Query for server state.

## Part C — Viewer

- Netflix-style home: **hero banner** (banner artwork) + horizontal rows per section (poster artwork).
- **Search + filters** (category, language) with an explicit empty state.
- **Show detail** (`/show/:showId`): synopsis, banner, season tabs, episode lists with thumbnails, and the language options for grouped episodes.
- **Trailers** (Season 0) render in a separate trailers section, not as a normal season.
- Slow images: `BlurImage` component shows a blur-up placeholder and fades in on load, `loading="lazy"` throughout.
- Reads **only** `/catalog` — never an admin endpoint.

## Part D — Pipeline & Operability

### Docker Compose
`docker compose up --build` bring up `db` (PostgreSQL 16, healthchecked), `api` (healthcheck on `/health`; `depends_on` Postgres), `cms` nginx-served, and `viewer`. The API image runs the backend package properly (`COPY . /app/backend`) and receives the real `PEBLO_*` env vars (this pair was a bug we caught: config used a plain Pydantic model that silently ignored environment variables).

### CI (GitHub Actions)
`.github/workflows/ci.yml`, two jobs:
1. **lint-and-test** — Postgres 16 service container; backend pytest against it (`PEBLO_POSTGRES_DSN`), plus `tsc --noEmit` and `oxlint` for both frontends.
2. **build-and-publish** — builds API/CMS/Viewer images; the deploy step is written out (immutable `git SHA` image tags → `docker compose pull && docker compose up -d` on the host) and doesn't ship to a real cloud.

### Environment & secrets
`.env.example` covers every variable (`PEBLO_POSTGRES_DSN`, `PEBLO_SECRET_KEY`, `PEBLO_ADMIN_PASSWORD`, `PEBLO_STORAGE_BACKEND`, `PEBLO_STORAGE_LOCAL_DIR`, `PEBLO_SEED_ON_STARTUP`, R2 set). **Production secret management:** keep secrets out of the repo and out of Compose files; load them from the platform's encrypted secret store (GitHub Actions Secrets / Docker secrets / boto-SSM or AWS Secrets Manager, whatever the deploy platform offers) and inject as env at runtime. Never commit `.env` (it's git-ignored).

### Health & alerting
`GET /health` returns `{"status": "ok"}` and is used by Compose and CI. **One thing we'd alert on: publish-run failure.** Reasoning: a failed or stale publish is the exact point where the *viewer-facing* experience silently diverges from what the content team believes is live — catalogue staleness is otherwise invisible until a child reports it. Alert on `publish_runs.status in ('failed',)` and on "no successful publish in > N hours" (staleness).

## Part E — Written Reasoning

### 1. How publishing is atomic (and if it dies mid-publish)
The catalogue is serialised to `catalogue.json.tmp`, then `os.rename` → `catalogue.json`. `rename()` is atomic on the same filesystem: a concurrent reader sees either the old complete file or the new complete file, never a half-written mix. If the process dies *before* rename, the live file is untouched (old version still served) and `publish_runs` shows `running`/`failed`; if it dies *after* rename but before the DB commit, the file is new and valid but the run is marked failed, so operators can see the divergence. Idempotent by design: re-publishing overwrites cleanly. A production hardening would move the file into the storage abstraction (S3-style writes are effectively write-once + new-object + atomic switch at the CDN/URL layer) and reconcile run status vs object existence on startup.

### 2. Storage abstraction
A tiny `StorageInterface` (upload/delete/get_url) with `LocalStorage` and `R2Storage`. Moving local → R2 means setting `PEBLO_STORAGE_BACKEND=r2` + the `PEBLO_R2_*` credentials (boto3 endpoint swap). One honest gap: the **catalogue file itself** is written to local disk, not through the abstraction — completing that (write the JSON via `storage.upload`) is the obvious next step, along with gated public URLs on R2.

### 3. Search
Server-side `ILIKE '%q%'` over `shows.name`, `shows.section`, `episodes.title`, with `category`/`language`/`section` filters composed. Fine well past a few thousand rows; the leading-wildcard `LIKE` can't use a B-tree index, so above ~10k+ episodes it degrades. Next step: Postgres full-text search (`to_tsvector`/`GIN`) for quality + speed, or a dedicated index for a catalogue in the millions.

### 4. Why serve a pre-published file at all?
- **Consistency**: the viewer gets a fixed snapshot; editors' half-saved drafts never leak.
- **Performance**: a file read beats a per-request aggregation query, and it can be cached at the CDN/edge.
- **Decoupling**: viewer uptime doesn't depend on DB nodes; publish is the only write path.

Where it bites: content changes are invisible until the next publish (an un-publish is delayed by the publish cycle); a static snapshot can't express highly dynamic queries; and two live artefacts (DB + file) must stay in sync. That's the right trade here — a small editorial team, gated publish, browse-mostly workload.

### 5. What was left out, and why
- **Editor vs admin split** — declared but shipped as a single enforced admin role; adding an editor persona needs a permissions table + a second token class and didn't change the demo experience.
- **Alembic migrations** — schema is `create_all` at startup for portability; a production repo would commit real migrations. This also keeps `docker compose up` working on a fresh machine with zero manual steps.
- **Versioned catalogue + rollback, publish dry-run/diff, per-row audit log** — the optional stretch items; `publish_runs` records *that* you published, not *what* changed.
- **The provided artifacts (`reference.json`, `seed_shows.json`, `assets/`)** — the authoring environment couldn't read `~/Downloads` (macOS TCC blocking), so the artwork specs were implemented straight from the Part A text and an equivalent deterministic seed was written. If those files land in the repo, pointing the seed at them is a ~20-line change.
- **Decisions made where the brief was ambiguous**: single admin role (above); representative episode per `content_group` carries the artwork requirements in validation; trailers are exposed via a `trailers` array so the viewer can show "Season 0" content without rendering a Season 0.

**AI tooling:** built with an AI pair-programmer (opencode). Its output was treated as a first draft: each change was reviewed by hand, and every claim above was verified against the running system (curl against the live API, `psql` row counts, Postgres-vs-SQLite checks, pytest, and `tsc`). The notable rejects/fixes: the base Pydantic config silently ignoring `PEBLO_*` env vars, the backend Docker image not containing the `backend` package, and a login endpoint that never existed but the CMS called.

**Rough time spent:** backend + data model/publish/search ≈ 3h, CMS ≈ 2.5h, viewer ≈ 1.5h, Docker/CI/secrets/README ≈ 2h. Total ≈ 9h, including the verification rounds.

## Notes
- Default login `admin` / `admin123`; token flow documented above.
- `catalogue.json`, `storage/`, `*.db`, and `node_modules/` are git-ignored and regenerated at startup.
- Artwork specs: poster 2:3 (~600×900), banner 16:9 (~1280×720), thumbnail 16:9 (~640×360), ≤ 200 KB, JPG/JPEG/PNG/WebP.
- Season 0 = trailers. `content_group` episodes collapse to one catalogue entry with a `languages` list.