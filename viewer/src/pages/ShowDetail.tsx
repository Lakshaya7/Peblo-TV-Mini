import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { fetchCatalogue } from "../api"
import BlurImage from "../components/BlurImage"
import { artUrl, showCoverUrl, LANGUAGE_NAMES, type CatalogueEpisode } from "../types"

export default function ShowDetail() {
  const { showId } = useParams<{ showId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeEpId = searchParams.get("ep")
  const id = Number(showId)

  const { data: catalogue, isLoading, isError } = useQuery({
    queryKey: ["catalogue"],
    queryFn: fetchCatalogue,
  })

  const [seasonTab, setSeasonTab] = useState<number | null>(null)
  const [coverFailed, setCoverFailed] = useState(false)

  const section = useMemo(
    () => catalogue?.sections.find((s) => s.show_id === id) ?? null,
    [catalogue, id]
  )

  const nonTrailerSeasons = useMemo(
    () => (section?.seasons ?? []).filter((s) => !s.is_trailer),
    [section]
  )
  const trailers = useMemo(() => section?.trailers ?? [], [section])

  const activeSeason = useMemo(() => {
    if (seasonTab === null) return nonTrailerSeasons[0] ?? null
    return nonTrailerSeasons.find((s) => s.season_number === seasonTab) ?? nonTrailerSeasons[0] ?? null
  }, [nonTrailerSeasons, seasonTab])

  const firstEpisode = section?.seasons[0]?.episodes[0] ?? null

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white pt-24 text-center text-gray-400">
        Loading show...
      </div>
    )
  }

  if (isError || !section) {
    return (
      <div className="min-h-screen bg-black text-white pt-24 text-center">
        <p className="text-red-400 mb-2">Show not found.</p>
        <Link to="/" className="text-sm text-gray-400 hover:underline">
          ← Back to browse
        </Link>
      </div>
    )
  }

  const hero = firstEpisode ? artUrl(firstEpisode.banner_path ?? firstEpisode.poster_path) : null
  const cover = showCoverUrl(section.show_title)

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="sticky top-0 z-30 bg-black/90 backdrop-blur px-6 sm:px-10 py-3">
        <Link to="/" className="text-2xl font-extrabold text-red-600 font-display">
          Peblo<span className="text-white">TV</span>
        </Link>
      </nav>

      {/* Banner hero */}
      <div className="relative w-full h-[48vh] min-h-[320px] max-h-[560px] overflow-hidden">
        {cover && !coverFailed ? (
          <div className="relative w-full h-full">
            <BlurImage src={cover} alt={section.show_title} className="w-full h-full" gradientClassName="bg-gradient-to-br from-gray-900 to-gray-800" />
            <img
              src={cover}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
              onError={(e) => {
                setCoverFailed(true)
                e.currentTarget.remove()
              }}
            />
          </div>
        ) : hero ? (
          <BlurImage src={hero} alt={section.show_title} className="w-full h-full" gradientClassName="bg-gradient-to-br from-gray-900 to-gray-800" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-950 flex items-center justify-center">
            <span className="text-5xl text-gray-700">{section.show_title[0]}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute bottom-0 px-6 sm:px-10 pb-10">
          <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">
            {section.section}
          </p>
          <h1 className="text-3xl sm:text-5xl font-display font-bold mb-3">{section.show_title}</h1>
          <p className="text-sm text-gray-300 max-w-2xl mb-5">
            {nonTrailerSeasons.length} season{nonTrailerSeasons.length === 1 ? "" : "s"} ·{" "}
            {nonTrailerSeasons.reduce(
              (n, s) => n + s.episodes.length,
              0
            )}{" "}
            episodes
            {trailers.length > 0 ? ` · ${trailers.length} trailer${trailers.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8">
        {/* Season tabs (trailers always excluded) */}
        {nonTrailerSeasons.length > 1 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {nonTrailerSeasons.map((s) => (
              <button
                key={s.season_number}
                onClick={() => setSeasonTab(s.season_number)}
                className={`px-4 py-1.5 rounded-full text-sm ${
                  activeSeason?.season_number === s.season_number
                    ? "bg-candy text-white font-semibold"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {s.season_title}
              </button>
            ))}
          </div>
        )}

        {/* Episode list for active season */}
        {activeSeason ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">{activeSeason.season_title}</h2>
            <ul className="space-y-3">
              {activeSeason.episodes.map((ep, i) => (
                <EpisodeRow
                  key={ep.episode_id}
                  ep={ep}
                  index={i}
                  isActive={String(ep.episode_id) === activeEpId}
                  onSelectLang={(lang) =>
                    setSearchParams({ ep: String(ep.episode_id), lang })
                  }
                />
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-gray-400 text-center py-12">No episodes available.</div>
        )}

        {/* Trailers section, clearly separated */}
        {trailers.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4">
              Trailers{trailers.length === 1 ? "" : ""}
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {trailers.map((ep) => (
                <div key={ep.episode_id} className="shrink-0 w-64">
<BlurImage
                      src={artUrl(ep.thumbnail_path ?? ep.poster_path)}
                      alt={ep.title}
                      aspectRatio="16/9"
                      className="rounded-xl w-full"
                      gradientClassName="bg-gray-800"
                    />
                  <p className="mt-2 text-sm text-gray-300">{ep.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EpisodeRow({
  ep,
  index,
  isActive,
  onSelectLang,
}: {
  ep: CatalogueEpisode
  index: number
  isActive: boolean
  onSelectLang: (lang: string) => void
}) {
  const selectedLang = new URLSearchParams(window.location.search).get("lang")
  const effectiveLang = selectedLang && ep.languages.includes(selectedLang) ? selectedLang : ep.languages[0]
  const thumb = artUrl(ep.thumbnail_path ?? ep.poster_path)

  return (
    <li
      className={`flex gap-4 p-3 rounded-2xl items-center ${
        isActive ? "bg-gray-800" : "bg-gray-900 hover:bg-gray-850"
      }`}
    >
      <span className="text-2xl font-bold text-gray-600 w-8 text-center shrink-0">
        {index + 1}
      </span>

      <div className="w-36 shrink-0">
        <BlurImage
          src={thumb}
          alt={ep.title}
          aspectRatio="16/9"
          className="rounded-xl w-full"
          gradientClassName="bg-gray-800"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium truncate">{ep.title}</p>
          <button
            onClick={() => onSelectLang(ep.languages[0])}
            className="text-xs text-candy hover:underline shrink-0"
          >
            ▶ Play
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-0.5">
          {Math.round(ep.duration / 60)} min
        </p>

        {ep.languages.length > 1 && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Audio:</span>
            {ep.languages.map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set("lang", lang)
                  window.history.replaceState(null, "", `?${params.toString()}`)
                }}
                className={`text-xs px-2 py-1 rounded ${
                  effectiveLang === lang
                    ? "bg-white text-black font-medium"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {LANGUAGE_NAMES[lang] ?? lang}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}