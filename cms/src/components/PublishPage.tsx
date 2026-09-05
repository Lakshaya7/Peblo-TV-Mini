import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchPublishRuns, fetchValidationReport, triggerPublish } from "../api"
import { useAuth } from "../auth"
import type { ValidationIssue } from "../types"

const CATEGORY_LABELS: Record<string, string> = {
  missing_artwork: "Episodes missing artwork",
  duration_zero: "Episodes without a valid duration",
  no_section: "Published shows without a section",
  duplicate_group_lang: "Duplicate language in content group",
}

const CATEGORY_ORDER = [
  "missing_artwork",
  "duration_zero",
  "no_section",
  "duplicate_group_lang",
]

function groupIssues(issues: ValidationIssue[]) {
  const byCategory = CATEGORY_ORDER.filter((c) =>
    issues.some((i) => i.category === c)
  ).map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c] ?? c,
    issues: issues.filter((i) => i.category === c),
  }))
  const other = issues.filter((i) => !CATEGORY_ORDER.includes(i.category))
  if (other.length) {
    byCategory.push({ category: "other", label: "Other issues", issues: other })
  }
  return byCategory
}

export default function PublishPage() {
  const queryClient = useQueryClient()
  const { username } = useAuth()
  const [runBy, setRunBy] = useState(username ?? "content-editor")
  const [published, setPublished] = useState<string | null>(null)

  const reportQuery = useQuery({
    queryKey: ["validation-report"],
    queryFn: fetchValidationReport,
  })

  const runsQuery = useQuery({
    queryKey: ["publish-runs"],
    queryFn: fetchPublishRuns,
  })

  const publishMutation = useMutation({
    mutationFn: () => triggerPublish(runBy),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["publish-runs"] })
      queryClient.invalidateQueries({ queryKey: ["validation-report"] })
      setPublished(
        `Catalogue published: ${run.total_shows} shows, ${run.total_episodes} episodes, ${run.total_artwork} artwork items.`
      )
    },
  })

  const report = reportQuery.data
  const blockingIssues = (report?.issues ?? []).filter(
    (i) => i.severity === "blocking"
  )
  const canPublish = report?.publishable === true
  const grouped = groupIssues(blockingIssues)

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Publish Catalogue</h1>
      <p className="text-sm text-gray-500 mb-6">
        Build the catalogue.json file that the viewer reads. Only content that
        passes validation is published.
      </p>

      {published && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md mb-6">
          {published}
        </div>
      )}

      {/* Validation report */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Validation Report
        </h2>

        {reportQuery.isLoading ? (
          <div className="text-gray-500 text-sm py-4">Loading validation report...</div>
        ) : reportQuery.isError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
            Could not load validation report.
          </div>
        ) : report && canPublish ? (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 px-4 py-3 rounded-md">
            <span className="font-medium">All checks passed.</span>
            <span className="text-sm">The catalogue is ready to publish.</span>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-md mb-4">
              <span className="font-medium">
                {blockingIssues.length} blocking issue
                {blockingIssues.length === 1 ? "" : "s"} found.
              </span>
              <span className="text-sm">Publishing is disabled until these are fixed.</span>
            </div>

            <div className="space-y-4">
              {grouped.map((group) => (
                <div
                  key={group.category}
                  className="border border-gray-200 rounded-md overflow-hidden"
                >
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      {group.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">
                      {group.issues.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {group.issues.map((issue, i) => (
                      <li
                        key={i}
                        className="px-4 py-2 text-sm text-gray-700 flex items-start gap-2"
                      >
                        <span className="mt-0.5 text-red-500 shrink-0">•</span>
                        {issue.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Publish action */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Trigger Publish</h2>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-700 shrink-0" htmlFor="run_by">
            Publishing as
          </label>
          <input
            id="run_by"
            value={runBy}
            onChange={(e) => setRunBy(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => publishMutation.mutate()}
            disabled={!canPublish || publishMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              canPublish
                ? "Publish the catalogue"
                : "Fix the blocking validation issues first"
            }
          >
            {publishMutation.isPending
              ? "Publishing..."
              : canPublish
                ? "Publish Catalogue"
                : "Publishing blocked"}
          </button>
          {!canPublish && (
            <span className="text-xs text-gray-500">
              Resolve the {blockingIssues.length} blocking issue
              {blockingIssues.length === 1 ? "" : "s"} above to enable publishing.
            </span>
          )}
        </div>

        {publishMutation.isError && (
          <div className="text-red-600 text-sm mt-3">
            Publish failed:{" "}
            {publishMutation.error instanceof Error
              ? publishMutation.error.message
              : "Unknown error"}
          </div>
        )}
      </div>

      {/* Run history */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Publish History</h2>
        </div>

        {runsQuery.isLoading ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            Loading publish history...
          </div>
        ) : (runsQuery.data ?? []).length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            No publish runs yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600 text-xs uppercase tracking-wider">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">When</th>
                  <th className="px-6 py-3">By</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Shows</th>
                  <th className="px-6 py-3">Episodes</th>
                  <th className="px-6 py-3">Artwork</th>
                  <th className="px-6 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(runsQuery.data ?? []).map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-700">#{run.id}</td>
                    <td className="px-6 py-3 text-gray-700">
                      {new Date(run.run_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-gray-700">{run.run_by}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          run.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : run.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-700">{run.total_shows}</td>
                    <td className="px-6 py-3 text-gray-700">{run.total_episodes}</td>
                    <td className="px-6 py-3 text-gray-700">{run.total_artwork}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs max-w-[220px] truncate">
                      {run.error_message ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}