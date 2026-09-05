import type { Catalogue } from "./types"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"

export const fetchCatalogue = async (): Promise<Catalogue> => {
  const res = await fetch(`${BASE_URL}/catalog`, { credentials: "include" })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      if (typeof err.detail === "string") detail = err.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  return res.json()
}