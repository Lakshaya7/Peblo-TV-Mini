import type { Artwork, Episode, PublishRun, Season, Show, ValidationReport } from "./types"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const apiFetch = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = new URL(`${BASE_URL}${endpoint}`)

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = localStorage.getItem("peblo_cms_token")
  if (token) headers.Authorization = `Bearer ${token}`

  const mergedOptions: RequestInit = {
    ...options,
    credentials: "include",
    headers,
  }

  const response = await fetch(url, mergedOptions)

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const errorData = await response.json()
      if (typeof errorData.detail === "string") {
        detail = errorData.detail
      } else if (Array.isArray(errorData.detail)) {
        detail = errorData.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ")
      } else if (errorData.detail && typeof errorData.detail === "object") {
        detail = JSON.stringify(errorData.detail)
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(detail, response.status)
  }

  return response.json() as Promise<T>
}

// ─── Auth ───────────────────────────────────────────────────────────

export const login = (username: string, password: string) =>
  apiFetch<{ access_token: string; token_type: string; username: string }>("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })

// ─── Shows ───────────────────────────────────────────────────────────

export const fetchShows = () => apiFetch<Show[]>("/admin/shows/")
export const createShow = (data: { name: string; description?: string; section?: string }) =>
  apiFetch<Show>("/admin/shows/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
export const updateShow = (id: number, data: Partial<Show>) =>
  apiFetch<Show>(`/admin/shows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
export const deleteShow = (id: number) =>
  apiFetch<{ detail: string }>(`/admin/shows/${id}`, { method: "DELETE" })

// ─── Seasons ─────────────────────────────────────────────────────────

export const fetchSeasons = (showId: number) =>
  apiFetch<Season[]>(`/admin/shows/${showId}/seasons/`)
export const createSeason = (
  showId: number,
  data: { number: number; title?: string; is_trailer?: boolean }
) =>
  apiFetch<Season>(`/admin/shows/${showId}/seasons/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

// ─── Episodes ────────────────────────────────────────────────────────

export const fetchEpisodes = (showId: number, seasonId: number) =>
  apiFetch<Episode[]>(`/admin/shows/${showId}/seasons/${seasonId}/episodes/`)

export const createEpisode = (
  showId: number,
  seasonId: number,
  data: {
    title: string
    description?: string
    duration: number
    language?: string
    content_group?: string
    is_trailer?: boolean
  }
) =>
  apiFetch<Episode>(`/admin/shows/${showId}/seasons/${seasonId}/episodes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

export const updateEpisode = (
  showId: number,
  seasonId: number,
  episodeId: number,
  data: Partial<Episode>
) =>
  apiFetch<Episode>(`/admin/shows/${showId}/seasons/${seasonId}/episodes/${episodeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

export const deleteEpisode = (
  showId: number,
  seasonId: number,
  episodeId: number
) =>
  apiFetch<{ detail: string }>(
    `/admin/shows/${showId}/seasons/${seasonId}/episodes/${episodeId}`,
    { method: "DELETE" }
  )

// ─── Artwork ──────────────────────────────────────────────────────────

export const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // result is a data URL; strip the prefix
      const comma = result.indexOf(",")
      resolve(result.slice(comma + 1))
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })

export const uploadArtwork = async (
  payload: {
    kind: "poster" | "banner" | "thumbnail"
    file: File
    original_filename: string
    show_id?: number
    episode_id?: number
  }
) => {
  const base64 = await toBase64(payload.file)
  return apiFetch<Artwork>("/admin/artwork/upload/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: payload.kind,
      file: base64,
      original_filename: payload.original_filename,
      show_id: payload.show_id,
      episode_id: payload.episode_id,
    }),
  })
}

// ─── Validation report / publish / runs ──────────────────────────────

export const fetchValidationReport = () =>
  apiFetch<ValidationReport>("/admin/validation-report/")

export const triggerPublish = (runBy: string) =>
  apiFetch<PublishRun>("/admin/catalog/publish/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_by: runBy }),
  })

export const fetchPublishRuns = () =>
  apiFetch<PublishRun[]>("/admin/publish-runs/")