export interface CatalogueEpisode {
  episode_id: number
  title: string
  languages: string[]
  content_group: string | null
  duration: number
  poster_path: string | null
  banner_path: string | null
  thumbnail_path: string | null
}

export interface CatalogueSeason {
  season_number: number
  season_title: string
  is_trailer: boolean
  episodes: CatalogueEpisode[]
}

export interface CatalogueSection {
  section: string
  show_title: string
  show_id: number
  seasons: CatalogueSeason[]
  trailers: CatalogueEpisode[]
}

export interface CatalogueMetadata {
  total_shows: number
  total_episodes: number
  total_artwork: number
  generated_at: string
}

export interface Catalogue {
  metadata: CatalogueMetadata
  sections: CatalogueSection[]
}

export interface SearchFilters {
  q: string
  category: string
  language: string
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  ta: "Tamil",
  bn: "Bengali",
  te: "Telugu",
}

export function artUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith("http")) return path
  // Stored paths are relative to the API's /static mount
  if (!path.startsWith("/")) path = `/static/${path}`
  if (path.startsWith("/static/")) return `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}${path}`
  return path
}