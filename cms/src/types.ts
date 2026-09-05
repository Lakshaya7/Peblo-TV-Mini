export interface Show {
  id: number
  name: string
  description: string | null
  section: string
  status: string
  created_at: string
  updated_at: string
}

export interface Season {
  id: number
  show_id: number
  number: number
  title: string | null
  is_trailer: boolean
  created_at: string
}

export interface Episode {
  id: number
  season_id: number | null
  show_id: number
  title: string
  description: string | null
  duration: number
  language: string
  content_group: string | null
  is_trailer: boolean
  season_number: number | null
  episode_number: number | null
}

export interface Artwork {
  id: number
  episode_id: number | null
  season_id: number | null
  show_id: number
  kind: "poster" | "banner" | "thumbnail"
  width: number
  height: number
  size_bytes: number
  path: string
  mime_type: string | null
  created_at: string
}

export interface PublishRun {
  id: number
  run_by: string
  run_at: string
  status: string
  total_shows: number
  total_episodes: number
  total_artwork: number
  catalogue_path: string | null
  error_message: string | null
  completed_at: string | null
}

export interface ValidationIssue {
  category: string
  severity: "blocking" | "warning"
  count: number
  detail: string
}

export interface ValidationReport {
  issues: ValidationIssue[]
  publishable: boolean
}

export interface ArtworkUploadPayload {
  kind: "poster" | "banner" | "thumbnail"
  file: Uint8Array | ArrayBuffer
  original_filename: string
  episode_id?: number
  season_id?: number
  show_id?: number
}

export const SECTION_OPTIONS = [
  "Children",
  "Drama",
  "Comedy",
  "Adventure",
  "Documentary",
  "General",
]