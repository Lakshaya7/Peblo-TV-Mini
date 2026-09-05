import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { fetchCatalogue } from "../api"
import BlurImage from "../components/BlurImage"
import { artUrl, showCoverUrl, LANGUAGE_NAMES, type CatalogueSection, type SearchFilters } from "../types"

const trait = (v: string) => v.trim().toLowerCase()

export default function Home() {
  const { data: catalogue, isLoading, isError, error } = useQuery({
    queryKey: ["catalogue"],
    queryFn: fetchCatalogue,
  })

  const [filters, setFilters] = useState<SearchFilters>({
    q: "",
    category: "",
    language: "",
  })

  const allSections = catalogue?.sections ?? []
  const categories = useMemo(
    () =>
      [...new Set(allSections.map((s) => s.section).filter(Boolean))].sort(),
    [allSections]
  )
  const languages = useMemo(() => {
    const langs = new Set<string>()
    for (const sec of allSections) {
      for (const season of sec.seasons) {
        for (const ep of season.episodes) {
          for (const l of ep.languages) langs.add(l)
        }
      }
    }
    return [...langs].sort()
  }, [allSections])

  const filteredSections = useMemo(() => {
    return allSections.filter((sec) => {
      if (filters.category && sec.section !== filters.category) return false
      if (filters.q) {
        const q = trait(filters.q)
        const showMatch = trait(sec.show_title).includes(q)
        const epMatch = sec.seasons.some((s) =>
          s.episodes.some((e) => trait(e.title).includes(q))
        )
        const seasonMatch = sec.seasons.some((s) =>
          trait(s.season_title).includes(q)
        )
        if (!showMatch && !epMatch && !seasonMatch) return false
      }
      if (filters.language) {
        const hasLang = sec.seasons.some((s) =>
          s.episodes.some((e) => e.languages.includes(filters.language))
        )
        if (!hasLang) return false
      }
      return true
    })
  }, [allSections, filters])

  const heroSection: CatalogueSection | null = filteredSections[0] ?? null
  const heroShow = heroSection ? (heroSection.seasons[0]?.episodes[0] ?? null) : null

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav
        filters={filters}
        onFiltersChange={setFilters}
        categories={categories}
        languages={languages}
      />

      {isLoading && (
        <main className="px-6 py-16 text-center text-gray-400">
          Loading catalogue...
        </main>
      )}

      {isError && (
        <main className="px-6 py-16 text-center">
          <p className="text-red-400 mb-2">Could not load the catalogue.</p>
          <p className="text-gray-500 text-sm">
            {error instanceof Error ? error.message : "Make sure the API is running and the catalogue has been published."}
          </p>
        </main>
      )}

      {!isLoading && !isError && catalogue && (
        <main>
          {!catalogue.sections || catalogue.sections.length === 0 ? (
            <EmptyState />
          ) : filteredSections.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-xl mb-2">No results match your filters.</p>
              <button
                onClick={() => setFilters({ q: "", category: "", language: "" })}
                className="mt-4 text-sm text-red-500 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              {heroSection && (
                <Hero
                  section={heroSection}
                  heroShow={heroShow}
                  onPlay={(epId) =>
                    (window.location.href = `/show/${heroSection.show_id}?ep=${epId}`)
                  }
                />
              )}
              <section className="mx-auto max-w-[1600px] px-6 sm:px-10 pb-12">
                {filteredSections.map((sec) => (
                  <Row key={`${sec.show_id}-${sec.section}`} section={sec} />
                ))}
              </section>
            </>
          )}
        </main>
      )}
    </div>
  )
}

/* ─── Nav ─────────────────────────────────────────────────────────── */

function Nav({
  filters,
  onFiltersChange,
  categories,
  languages,
}: {
  filters: SearchFilters
  onFiltersChange: (f: SearchFilters) => void
  categories: string[]
  languages: string[]
}) {
  return (
    <nav className="sticky top-0 z-30 bg-black/90 backdrop-blur border-b border-gray-900">
      <div className="max-w-[1600px] mx-auto px-6 sm:px-10 py-3 flex items-center gap-4 flex-wrap">
        <Link to="/" className="text-2xl font-extrabold tracking-tight text-red-600 shrink-0 font-display">
          Peblo<span className="text-white">TV</span>
        </Link>

        <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-xl">
          <input
            type="text"
            value={filters.q}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
            placeholder="Search shows and episodes..."
            className="w-full px-4 py-2 rounded-full bg-gray-800 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-candy"
          />
        </div>

        <select
          value={filters.category}
          onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
          className="px-3 py-2 rounded-full bg-gray-800 text-sm focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={filters.language}
          onChange={(e) => onFiltersChange({ ...filters, language: e.target.value })}
          className="px-3 py-2 rounded-full bg-gray-800 text-sm focus:outline-none"
        >
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l] ?? l}
            </option>
          ))}
        </select>

        {(filters.q || filters.category || filters.language) && (
          <button
            onClick={() => onFiltersChange({ q: "", category: "", language: "" })}
            className="text-sm text-gray-400 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
    </nav>
  )
}

/* ─── Hero ────────────────────────────────────────────────────────── */

function Hero({
  section,
  heroShow,
  onPlay,
}: {
  section: CatalogueSection
  heroShow: CatalogueSection["seasons"][number]["episodes"][number] | null
  onPlay: (epId: number) => void
}) {
  const banner = heroShow ? artUrl(heroShow.banner_path ?? heroShow.poster_path) : null
  const cover = showCoverUrl(section.show_title)
  const [coverFailed, setCoverFailed] = useState(false)

  return (
    <div className="relative w-full h-[42vh] min-h-[360px] max-h-[620px] overflow-hidden">
      <div className="absolute inset-0">
        {cover && !coverFailed ? (
          <div className="relative w-full h-full">
            <BlurImage
              src={cover}
              alt={section.show_title}
              className="w-full h-full object-cover blur-md scale-110"
              gradientClassName="bg-gradient-to-br from-gray-900 to-gray-800"
            />
            {/* Detect a missing cover file and fall back to episode artwork */}
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
        ) : banner ? (
          <BlurImage
            src={banner}
            alt={section.show_title}
            className="w-full h-full"
            gradientClassName="bg-gradient-to-br from-gray-900 to-gray-800"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
            <span className="text-4xl text-gray-600">{section.show_title[0]}</span>
          </div>
        )}
      </div>

      {cover && !coverFailed && (
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/30" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

      {cover && !coverFailed && (
        <div className="absolute right-6 sm:right-12 top-1/2 -translate-y-1/2 hidden xl:block">
          <div className="h-[54vh] max-h-[400px] aspect-[2/3]">
            <BlurImage
              src={cover}
              alt={section.show_title}
              aspectRatio="2/3"
              className="w-full h-full rounded-2xl shadow-2xl shadow-black/70 ring-1 ring-white/20"
              gradientClassName="bg-gray-800"
            />
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 px-6 sm:px-10 pb-12 max-w-[1600px] mx-auto">
        <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">
          {section.section}
        </p>
        <h1 className="text-3xl sm:text-5xl font-display font-bold drop-shadow-lg mb-3">
          {section.show_title}
        </h1>
        {heroShow && (
          <p className="text-sm text-gray-200 max-w-xl mb-5 hidden sm:block">
            {heroShow.title} · Available in{" "}
            {heroShow.languages
              .map((l) => LANGUAGE_NAMES[l] ?? l)
              .join(", ")}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={() => heroShow && onPlay(heroShow.episode_id)}
            className="bg-candy text-white font-semibold px-8 py-2.5 rounded-full hover:bg-candy-soft shadow-md shadow-candy/30 transition-colors"
          >
            ▶ Play
          </button>
          <Link
            to={`/show/${section.show_id}`}
            className="bg-gray-700/70 text-white font-semibold px-8 py-2.5 rounded-full hover:bg-gray-600/70 transition-colors"
          >
            More Info
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ─── Row of sections (horizontal cards) ─────────────────────────── */

function Row({ section }: { section: CatalogueSection }) {
  const episodes = section.seasons.flatMap((season) =>
    season.episodes.map((ep) => ({ ...ep, season }))
  )

  if (episodes.length === 0) return null

  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-display font-semibold text-white">
          {section.show_title}
        </h2>
        <span className="text-xs text-gray-400 uppercase tracking-wider">
          {section.section}
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 sm:-mx-10 px-6 sm:px-10 scrollbar-thin">
        {episodes.map((ep) => {
          const poster =
            showCoverUrl(section.show_title) ?? artUrl(ep.poster_path ?? ep.thumbnail_path)
          return (
            <Link
              key={ep.episode_id}
              to={`/show/${section.show_id}?ep=${ep.episode_id}`}
              className="group shrink-0 w-40 sm:w-44"
            >
              <BlurImage
                src={poster}
                alt={ep.title}
                aspectRatio="2/3"
                className="rounded-xl w-full"
                gradientClassName="bg-gradient-to-br from-gray-800 to-gray-900"
              />
              <p className="mt-2 text-sm text-gray-300 group-hover:text-white truncate">
                {ep.title}
              </p>
              <p className="text-xs text-gray-500">
                {ep.languages[0].toUpperCase()} · {Math.round(ep.duration / 60)} min
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Empty state ────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="py-24 text-center">
      <p className="text-2xl mb-2">No content yet</p>
      <p className="text-gray-500">
        The catalogue is empty. Publish some shows from the CMS first.
      </p>
    </div>
  )
}