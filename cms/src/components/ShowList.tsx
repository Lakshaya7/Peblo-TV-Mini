import { useMemo, useState, type FormEvent } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { createShow, deleteShow, fetchShows, updateShow } from "../api"
import { SECTION_OPTIONS, type Show } from "../types"

const PAGE_SIZE = 10

interface ShowListState {
  data: Show[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  is403: boolean
  search: string
  setSearch: (v: string) => void
  filterSection: string
  setFilterSection: (v: string) => void
  filterStatus: string
  setFilterStatus: (v: string) => void
  page: number
  setPage: (n: number) => void
  totalPages: number
  filtered: Show[]
  createMutation: ReturnType<typeof useMutation<Show, Error, { name: string; description?: string; section?: string }>>
  updateMutation: ReturnType<typeof useMutation<Show, Error, { id: number; data: Partial<Show> }>>
  deleteMutation: ReturnType<typeof useMutation<{ detail: string }, Error, number>>
}

export const useShowList = (): ShowListState => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [filterSection, setFilterSection] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["shows"],
    queryFn: fetchShows,
    select: (shows) => shows as Show[],
  })

  const invalidateShows = () => {
    queryClient.invalidateQueries({ queryKey: ["shows"] })
  }

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; section?: string }) =>
      createShow(data),
    onSuccess: invalidateShows,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Show> }) =>
      updateShow(id, data),
    onSuccess: invalidateShows,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteShow(id),
    onSuccess: invalidateShows,
  })

  const shows = data ?? []

  const filtered = useMemo(() => {
    let list = shows
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q)
      )
    }
    if (filterSection) {
      list = list.filter((s) => s.section === filterSection)
    }
    if (filterStatus) {
      list = list.filter((s) => s.status === filterStatus)
    }
    return list
  }, [shows, search, filterSection, filterStatus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const is403 = isError
    ? (error instanceof Error && [401, 403].includes((error as Error & { status?: number }).status ?? 0))
    : false

  return {
    data: shown,
    isLoading,
    isError,
    error,
    is403,
    search,
    setSearch,
    filterSection,
    setFilterSection,
    filterStatus,
    setFilterStatus,
    page,
    setPage,
    totalPages,
    filtered,
    createMutation,
    updateMutation,
    deleteMutation,
  }
}

export default function ShowList() {
  const {
    data: shows,
    isLoading,
    isError,
    error,
    is403,
    search,
    setSearch,
    filterSection,
    setFilterSection,
    filterStatus,
    setFilterStatus,
    page,
    setPage,
    totalPages,
    filtered,
    createMutation,
    updateMutation,
    deleteMutation,
  } = useShowList()

  const [showFormOpen, setShowFormOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [section, setSection] = useState("General")
  const [editing, setEditing] = useState<Show | null>(null)

  const resetForm = () => {
    setName("")
    setDescription("")
    setSection("General")
    setEditing(null)
    setShowFormOpen(false)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: { name, description, section } })
    } else {
      createMutation.mutate({ name, description, section })
    }
    resetForm()
  }

  const startCreate = () => {
    setEditing(null)
    setName("")
    setDescription("")
    setSection("General")
    setShowFormOpen(true)
  }

  const startEdit = (show: Show) => {
    setEditing(show)
    setName(show.name)
    setDescription(show.description ?? "")
    setSection(show.section)
    setShowFormOpen(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shows</h1>
        <button
          onClick={startCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          + New Show
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search shows..."
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterSection}
            onChange={(e) => {
              setFilterSection(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All sections</option>
            {SECTION_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <div className="text-sm text-gray-500 flex items-center">
            {filtered.length} show{filtered.length === 1 ? "" : "s"} found
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          Loading shows...
        </div>
      )}

      {/* Permission denied state */}
      {is403 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-6 text-center">
          <p className="font-medium">Permission denied</p>
          <p className="text-sm mt-1">
            Your account does not have access to manage shows. Contact an administrator.
          </p>
        </div>
      )}

      {/* Error state */}
      {isError && !is403 && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-6 text-center">
          <p className="font-medium">Could not load shows</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "An unknown error occurred"}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && shows.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500 mb-4">No shows yet.</p>
          <button
            onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            Create your first show
          </button>
        </div>
      )}

      {/* List */}
      {!isLoading && !isError && shows.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {shows.map((show) => (
              <li key={show.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <Link to={`/shows/${show.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-gray-900 truncate">{show.name}</p>
                      <p className="text-sm text-gray-500 truncate">
                        {show.description || "No description"}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-3 ml-4">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                    {show.section}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      show.status === "published"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {show.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      startEdit(show)
                    }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (window.confirm(`Delete "${show.name}" and all its content?`)) {
                        deleteMutation.mutate(show.id)
                      }
                    }}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 px-3 py-1 border border-gray-300 rounded"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 px-3 py-1 border border-gray-300 rounded"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit modal */}
      {showFormOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editing ? "Edit Show" : "New Show"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Section
                </label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SECTION_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {editing ? "Save changes" : "Create show"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}