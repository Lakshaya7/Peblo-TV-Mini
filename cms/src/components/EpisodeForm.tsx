import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createEpisode, updateEpisode, uploadArtwork } from "../api"
import type { Episode } from "../types"

const MAX_SIZE_BYTES = 200 * 1024
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"]

const ARTWORK_SPECS = {
  poster: {
    label: "Poster",
    hint: "2:3 ratio · ≈ 600×900 px",
    ratio: 2 / 3,
  },
  banner: {
    label: "Banner",
    hint: "16:9 ratio · ≈ 1280×720 px",
    ratio: 16 / 9,
  },
  thumbnail: {
    label: "Thumbnail",
    hint: "16:9 ratio · ≈ 640×360 px",
    ratio: 16 / 9,
  },
} as const

type ArtworkKind = keyof typeof ARTWORK_SPECS

interface ArtworkSelection {
  file: File | null
  previewUrl: string | null
  errors: string[]
  dimensions: { width: number; height: number } | null
}

const emptySelection = (): ArtworkSelection => ({
  file: null,
  previewUrl: null,
  errors: [],
  dimensions: null,
})

function validateFile(kind: ArtworkKind, file: File): Promise<ArtworkSelection> {
  const spec = ARTWORK_SPECS[kind]
  const errors: string[] = []

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!ALLOWED_EXT.includes(ext)) {
    errors.push(`Format must be one of: ${ALLOWED_EXT.join(", ")}`)
  }

  if (file.size > MAX_SIZE_BYTES) {
    errors.push(
      `File is ${(file.size / 1024).toFixed(0)} KB — must be 200 KB or smaller`
    )
  }

  const previewUrl = URL.createObjectURL(file)

  return new Promise((resolve) => {
    if (ext && !ALLOWED_EXT.includes(ext)) {
      resolve({ file, previewUrl, errors, dimensions: null })
      return
    }
    const img = new Image()
    img.onload = () => {
      const w = img.width
      const h = img.height
      let dims: { width: number; height: number } | null = { width: w, height: h }
      const ratio = w / h
      const ratioTolerance = spec.ratio * 0.1
      if (Math.abs(ratio - spec.ratio) > ratioTolerance) {
        errors.push(
          `Aspect ratio ${ratio.toFixed(2)}:1 doesn't match ${spec.hint}`
        )
      }
      resolve({ file, previewUrl, errors, dimensions: dims })
    }
    img.onerror = () => {
      resolve({ file, previewUrl, errors, dimensions: null })
    }
    img.src = previewUrl
  })
}

interface EpisodeFormProps {
  showId: number
  seasonId: number
  editing?: Episode | null
  onClose: () => void
}

export default function EpisodeForm({
  showId,
  seasonId,
  editing,
  onClose,
}: EpisodeFormProps) {
  const queryClient = useQueryClient()

  const [title, setTitle] = useState(editing?.title ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [duration, setDuration] = useState(
    editing ? String(editing.duration ?? "") : ""
  )
  const [language, setLanguage] = useState(editing?.language ?? "en")
  const [contentGroup, setContentGroup] = useState(editing?.content_group ?? "")
  const [isTrailer, setIsTrailer] = useState(editing?.is_trailer ?? false)

  const [artwork, setArtwork] = useState<Record<ArtworkKind, ArtworkSelection>>({
    poster: emptySelection(),
    banner: emptySelection(),
    thumbnail: emptySelection(),
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [artworkUpserting, setArtworkUpserting] = useState(false)

  const saveMutation = useMutation({
    mutationFn: (episode: {
      id?: number
      data: {
        title: string
        description?: string
        duration: number
        language?: string
        content_group?: string
        is_trailer?: boolean
      }
    }) => {
      if (episode.id !== undefined) {
        return updateEpisode(showId, seasonId, episode.id, episode.data)
      }
      return createEpisode(showId, seasonId, episode.data)
    },
    onSuccess: (ep) => {
      queryClient.invalidateQueries({ queryKey: ["episodes", showId, seasonId] })
      void ep
    },
  })

  const handleFileChange = async (kind: ArtworkKind, file: File | null) => {
    if (!file) {
      setArtwork((prev) => ({ ...prev, [kind]: emptySelection() }))
      return
    }
    // Revoke any previous preview URL
    const prev = artwork[kind]
    if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl)

    const selection = await validateFile(kind, file)
    setArtwork((prev) => ({ ...prev, [kind]: selection }))
  }

  const artworkErrors = Object.values(artwork).flatMap((a) => a.errors)
  const hasArtworkSelected = Object.values(artwork).some((a) => a.file)

  const handleSubmit = async () => {
    setFormError(null)
    if (!title.trim()) {
      setFormError("Title is required.")
      return
    }
    const dur = Number(duration)
    if (!Number.isFinite(dur) || dur <= 0) {
      setFormError("Duration must be a positive number of seconds.")
      return
    }
    if (artworkErrors.length > 0) {
      setFormError("Fix the artwork errors below before saving.")
      return
    }

    const payload = {
      title: title.trim(),
      description: description || undefined,
      duration: dur,
      language,
      content_group: contentGroup.trim() || undefined,
      is_trailer: isTrailer,
    }

    saveMutation.mutate(
      { id: editing?.id, data: payload },
      {
        onSuccess: async (saved) => {
          // Upload artwork after the episode exists
          const epId = (saved as Episode).id ?? editing?.id
          if (epId !== undefined && hasArtworkSelected) {
            setArtworkUpserting(true)
            const kinds = (Object.keys(ARTWORK_SPECS) as ArtworkKind[]).filter(
              (k) => artwork[k].file
            )
            let failed = false
            for (const k of kinds) {
              const file = artwork[k].file!
              try {
                await uploadArtwork({
                  kind: k,
                  file,
                  original_filename: file.name,
                  show_id: showId,
                  episode_id: epId,
                })
              } catch (err) {
                failed = true
                setFormError(
                  `Saved episode, but ${ARTWORK_SPECS[k].label} upload failed: ${
                    err instanceof Error ? err.message : "unknown error"
                  }`
                )
              }
            }
            setArtworkUpserting(false)
            if (!failed) {
              queryClient.invalidateQueries({ queryKey: ["episodes", showId, seasonId] })
              queryClient.invalidateQueries({ queryKey: ["validation-report"] })
              onClose()
            }
          } else {
            queryClient.invalidateQueries({ queryKey: ["validation-report"] })
            onClose()
          }
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "Failed to save episode")
        },
      }
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        {editing ? `Edit Episode: ${editing.title}` : "New Episode"}
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration (seconds) *
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min="1"
              placeholder="e.g. 1200"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="es">Spanish</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Content group
          </label>
          <input
            value={contentGroup}
            onChange={(e) => setContentGroup(e.target.value)}
            placeholder="e.g. episode_1 — episodes sharing a group are language variants"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isTrailer}
            onChange={(e) => setIsTrailer(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label className="text-sm text-gray-700">
            This is a trailer (not shown in normal viewer rows)
          </label>
        </div>

        {/* Artwork upload slots */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Artwork</h3>
          <p className="text-xs text-gray-500 mb-4">
            All images must be JPG, PNG or WebP and no larger than 200 KB. You can
            upload any combination of the three sizes below.
          </p>

          <div className="space-y-4">
            {(Object.keys(ARTWORK_SPECS) as ArtworkKind[]).map((kind) => {
              const spec = ARTWORK_SPECS[kind]
              const sel = artwork[kind]
              return (
                <div
                  key={kind}
                  className="border border-gray-200 rounded-md p-3"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <label className="font-medium text-gray-900 text-sm">
                      {spec.label}
                    </label>
                    <span className="text-xs text-gray-500">{spec.hint}</span>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileChange(kind, e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-700"
                  />

                  {sel.previewUrl && (
                    <div className="mt-3">
                      <img
                        src={sel.previewUrl}
                        alt={`${spec.label} preview`}
                        className={`max-w-full h-auto rounded border border-gray-200 ${
                          sel.dimensions ? "" : "opacity-60"
                        }`}
                      />
                      {sel.dimensions && (
                        <p className="text-xs text-gray-500 mt-1">
                          {sel.dimensions.width} × {sel.dimensions.height} px ·{" "}
                          {(sel.file!.size / 1024).toFixed(0)} KB
                        </p>
                      )}
                    </div>
                  )}

                  {sel.errors.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {sel.errors.map((err, i) => (
                        <li
                          key={i}
                          className="text-xs text-red-600 flex items-start gap-1"
                        >
                          <span className="mt-0.25">•</span> {err}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
            {formError}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saveMutation.isPending || artworkUpserting}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {artworkUpserting
              ? "Uploading artwork..."
              : saveMutation.isPending
                ? "Saving..."
                : editing
                  ? "Save changes"
                  : "Create episode"}
          </button>
        </div>
      </div>
    </div>
  )
}