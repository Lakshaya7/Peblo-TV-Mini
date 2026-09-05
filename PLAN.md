# Frontend Plan — Peblo TV Mini

Both CMS and Viewer are heavily broken. Every component has TS errors, broken imports, dead styling, and missing features. The plan is organized in phases.

---

## Phase 0: Backend prerequisites (must come first)

The CMS and Viewer both depend on backend endpoints/routes that don't exist yet.

1. **Add `DELETE /admin/shows/{id}`** — CMS needs it
2. **Add `GET /admin/publish-runs/`** — PublishPage needs run history  
3. **Mount `StaticFiles` at `/static/`** — Viewer needs artwork URLs
4. **Expand catalogue payload** — Add `banner_path` and `thumbnail_path` alongside `poster_path` per episode
5. **Fix `uuid4` import** in `main.py:251` — `from uuid import uuid4`

---

## Phase 1: CMS — Install deps, fix build, basic routing

### 1a. Install missing packages
```
cd cms && npm install react-router-dom
# Tailwind via CDN or postcss — will use Tailwind CDN via index.html for speed
```

### 1b. Fix `main.tsx`
- Use `createRoot` from `react-dom/client`
- Fix imports: `QueryClient` and `QueryClientProvider` from `@tanstack/react-query`
- Add `BrowserRouter` + `Routes` for pages
- Add basic nav (shows / publish)

### 1c. Add shared types file `src/types.ts`
- `Show`, `Season`, `Episode`, `Artwork`, `PublishRun`, `ValidationIssue`, `ValidationReport`, `SearchResult`

### 1d. Fix `api.ts`
- Remove `/api` prefix from all endpoints (backend has no `/api`)
- Fix artwork upload to send base64 JSON (not FormData)
- Add `deleteShow`, `fetchPublishRuns`, `updateEpisode`, `deleteEpisode`
- Add typed functions

### 1e. Fix Vite proxy
- `/api` → `http://localhost:8000` (keep, works for local dev proxy)

---

## Phase 2: CMS — ShowList with full features

Rewrite `ShowList.tsx`:
- Search input (client-side filter on show name)
- Filter dropdowns: section, status
- Paginated table/grid (client-side with 20/page)
- Click show → navigate to season/episode detail (nested route)
- Create show form (name, description, section, status)
- Edit show inline or via modal
- Delete with confirmation
- States: loading spinner, empty state, error state

---

## Phase 3: CMS — Season + Episode management

### New `SeasonList.tsx`
- List seasons for a show
- Create season (number, title, is_trailer toggle)
- Click season → episodes

### Rewrite `EpisodeForm.tsx`
- Three labeled artwork upload slots (poster/banner/thumbnail)
- Each slot shows:
  - Required dimensions and ratio text
  - File input (accept image types)
  - Live preview of selected image
  - Real-time validation: size ≤200KB, format check, dimension display
  - Human-readable error messages
- Episode fields: title, description, duration, language, content_group, is_trailer
- Submit: create episode → upload artwork (if files selected)
- States: loading, error

---

## Phase 4: CMS — PublishPage with run history

Rewrite `PublishPage.tsx`:
- Fetch validation report (already partially works)
- Show grouped blocking issues with category headers
- Publish button: disabled with reason text when `publishable=false`
- Run history: fetch `GET /admin/publish-runs/`, display in table
- States: loading, empty, error, success toast

---

## Phase 5: CMS — Login screen

- Simple login form (username + password)
- Store credentials in context (for Authorization header)
- If 403, show permission-denied state with re-login prompt
- Protected routes behind auth

---

## Phase 6: CMS — Tailwind + polish

- Add Tailwind (via CDN link in `index.html` or proper postcss setup)
- Responsive layout
- Consistent spacing, colors, typography
- Loading spinners, empty states, error cards

---

## Phase 7: Viewer — Fix deps, mount, routing

### 7a. Install missing packages
```
cd viewer && npm install @tanstack/react-query react-router-dom
```

### 7b. Fix `main.tsx`
- `createRoot` from `react-dom/client`
- Correct `@tanstack/react-query` imports
- Add `BrowserRouter` + routes

### 7c. Fix Vite proxy
- Keep `/api` → `http://localhost:8000`

---

## Phase 8: Viewer — Netflix-style layout

Rewrite `Viewer.tsx`:
- **Hero banner**: first section's show with banner artwork (from catalogue), large background image, title, description
- **Horizontal scrollable rows**: one row per section
  - Row header: section name
  - Cards: poster artwork + show title + season info
  - Episode thumbnails within expandable row
- **Show detail page** (route: `/show/:showId`):
  - Large banner + synopsis
  - Season tabs
  - Episode list with thumbnail, title, duration, language selector
  - Language options for content_group variants

---

## Phase 9: Viewer — Search + filters + empty states

- Search bar in nav (client-side filter on show/episode title)
- Category dropdown (from catalogue sections)
- Language dropdown (from available languages)
- Empty state: "No results match your filters"
- Loading skeleton / spinner

---

## Phase 10: Viewer — Slow image handling

- `BlurImage` component: shows blurred placeholder (colored div or base64 tiny thumbnail)
- `onLoad` swaps to real image with fade transition
- `loading="lazy"` on all images
- Smooth UI during load

---

## Phase 11: Dockerfiles for CMS + Viewer

Create `cms/Dockerfile` and `viewer/Dockerfile`:
- Multi-stage: build with node, serve with nginx
- COPY dist to nginx html dir
- Add nginx.conf for SPA routing + API proxy

---

## Phase 12: Verify builds

- `cd cms && npx tsc -b --noEmit` → 0 errors
- `cd cms && npm run build` → success
- `cd viewer && npx tsc -b --noEmit` → 0 errors
- `cd viewer && npm run build` → success
- `docker-compose config` → valid
