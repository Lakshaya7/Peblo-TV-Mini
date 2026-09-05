# Peblo TV Mini — CMS (Internal Content Management)

React + TypeScript + Vite admin app for managing shows, seasons, episodes, and artwork, publishing the public catalogue, and viewing publish-run history.

- **Login:** `admin` / `admin123` (client-side token stored in `localStorage`, sent as `Authorization: Bearer`)
- **API base:** `VITE_API_BASE_URL` (defaults to `http://localhost:8000`)
- **Pages:** Shows list (search/filter/pagination/CRUD), Show detail (seasons + episodes), Episode form (3 validated artwork slots), Publish (validation report + run history)

```bash
npm install
npm run dev      # local dev (default port 5173)
npx tsc -b --noEmit
npm run build    # production build → dist/ (served by nginx in Docker)
```

See the root `README.md` for full run instructions.