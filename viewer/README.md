# Peblo TV Mini — Viewer (Netflix-style app)

React + TypeScript + Vite public-facing app that renders the published catalogue.

- Data comes from `GET /catalog` (served at `http://localhost:8000/catalog`)
- Pages: Home (hero banner + horizontal rows per section, search + section/language filters) and Show detail (`/show/:showId` — banner, season tabs, episode rows, language variants, trailers)
- `components/BlurImage.tsx` handles slow-loading artwork with a blur-up + fade transition and lazy loading
- **API base:** `VITE_API_BASE_URL` (defaults to `http://localhost:8000`)

```bash
npm install
npm run dev      # local dev (default port 5174)
npx tsc -b --noEmit
npm run build    # production build → dist/ (served by nginx in Docker)
```

See the root `README.md` for full run instructions.