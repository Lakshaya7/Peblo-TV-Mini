import { useState, type FormEvent } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { createSeason, fetchSeasons, fetchShows, fetchEpisodes } from "../api"
import type { Episode, Season } from "../types"
import EpisodeForm from "./EpisodeForm"

export default function ShowDetail() {
  const { showId } = useParams<{ showId: string }>()
  const id = Number(showId)
  const queryClient = useQueryClient()

  const [seasonFormOpen, setSeasonFormOpen] = useState(false)
  const [seasonNumber, setSeasonNumber] = useState("")
  const [seasonTitle, setSeasonTitle] = useState("")
  const [isTrailerSeason, setIsTrailerSeason] = useState(false)
  const [episodeTarget, setEpisodeTarget] = useState<{
    seasonId: number
    editing?: Episode
  } | null>(null)

  const { data: show, isLoading: showLoading } = useQuery({
    queryKey: ["show", id],
    queryFn: async () => {
      const shows = await fetchShows()
      return shows.find((s) => s.id === id) ?? null
    },
  })

  const { data: seasons = [], isLoading: seasonsLoading } = useQuery({
    queryKey: ["seasons", id],
    queryFn: () => fetchSeasons(id),
    enabled: Number.isFinite(id),
  })

  const createSeasonMutation = useMutation({
    mutationFn: (data: { number: number; title?: string; is_trailer?: boolean }) =>
      createSeason(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seasons", id] })
      setSeasonNumber("")
      setSeasonTitle("")
      setIsTrailerSeason(false)
      setSeasonFormOpen(false)
    },
  })

  const handleSeasonSubmit = (e: FormEvent) => {
    e.preventDefault()
    const num = Number(seasonNumber)
    if (!Number.isFinite(num) || num <= 0) return
    createSeasonMutation.mutate({
      number: num,
      title: seasonTitle || undefined,
      is_trailer: isTrailerSeason,
    })
  }

  const sortedSeasons = [...seasons].sort((a, b) => {
    if (a.is_trailer !== b.is_trailer) return a.is_trailer ? 1 : -1
    return a.number - b.number
  })

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to shows
        </Link>
      </div>

      {showLoading ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          Loading show...
        </div>
      ) : show ? (
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{show.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {show.description || "No description"} · Section: {show.section} · Status: {show.status}
          </p>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-6">
          Show not found.
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Seasons</h2>
        <button
          onClick={() => setSeasonFormOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          + New Season
        </button>
      </div>

      {seasonsLoading ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          Loading seasons...
        </div>
      ) : sortedSeasons.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          No seasons yet. Create your first season.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedSeasons.map((season) => (
            <SeasonCard
              key={season.id}
              showId={id}
              season={season}
              onAddEpisode={() => setEpisodeTarget({ seasonId: season.id })}
              onEditEpisode={(ep) => setEpisodeTarget({ seasonId: season.id, editing: ep })}
            />
          ))}
        </div>
      )}

      {/* Create season modal */}
      {seasonFormOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">New Season</h2>
            <form onSubmit={handleSeasonSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Season number *
                </label>
                <input
                  type="number"
                  value={seasonNumber}
                  onChange={(e) => setSeasonNumber(e.target.value)}
                  required
                  min="1"
                  placeholder="e.g. 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Season title
                </label>
                <input
                  type="text"
                  value={seasonTitle}
                  onChange={(e) => setSeasonTitle(e.target.value)}
                  placeholder="e.g. Season One"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isTrailerSeason}
                  onChange={(e) => setIsTrailerSeason(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label className="text-sm text-gray-700">
                  Trailer season (Season 0 — hidden from viewer rows)
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSeasonFormOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSeasonMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Create season
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Episode form modal */}
      {episodeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <EpisodeForm
              showId={id}
              seasonId={episodeTarget.seasonId}
              editing={episodeTarget.editing ?? null}
              onClose={() => setEpisodeTarget(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SeasonCard({
  showId,
  season,
  onAddEpisode,
  onEditEpisode,
}: {
  showId: number
  season: Season
  onAddEpisode: () => void
  onEditEpisode: (ep: Episode) => void
}) {
  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ["episodes", showId, season.id],
    queryFn: () => fetchEpisodes(showId, season.id),
  })

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-900">
            {season.is_trailer ? "Trailers" : season.title || `Season ${season.number}`}
          </span>
          <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
            Season {season.number}
          </span>
          {season.is_trailer && (
            <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
              Trailers (hidden from viewer rows)
            </span>
          )}
          <span className="text-sm text-gray-500">{episodes.length} episode{episodes.length === 1 ? "" : "s"}</span>
        </div>
        <button
          onClick={onAddEpisode}
          className="text-sm text-blue-600 hover:underline"
        >
          + Episode
        </button>
      </div>

      {isLoading ? (
        <div className="p-4 text-sm text-gray-500">Loading episodes...</div>
      ) : episodes.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No episodes yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {episodes.map((ep) => (
            <li key={ep.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{ep.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {ep.language.toUpperCase()} · {Math.round(ep.duration / 60)} min
                  {ep.content_group ? ` · group: ${ep.content_group}` : ""}
                  {ep.is_trailer ? " · trailer" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <button
                  onClick={() => onEditEpisode(ep)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}