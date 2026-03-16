import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import type { TopicRow, TopicKeywordRow } from '../../../types'

const INTENT_COLORS: Record<string, string> = {
  informational:  'bg-blue-100 text-blue-700',
  commercial:     'bg-yellow-100 text-yellow-700',
  transactional:  'bg-green-100 text-green-700',
  navigational:   'bg-gray-100 text-gray-600',
}

export function TopicsView(): JSX.Element {
  const { project } = useAppStore()
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState('')

  const { data: topics = [], isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: () => window.api.getTopics(),
    enabled: !!project
  })

  // Auto-refresh when the scheduler re-clusters in the background
  useEffect(() => {
    return window.api.onTopicsUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['topics'] })
    })
  }, [queryClient])

  async function handleRun(): Promise<void> {
    setRunning(true)
    setRunMsg('')
    try {
      const result = await window.api.runTopicClustering()
      await queryClient.invalidateQueries({ queryKey: ['topics'] })
      setRunMsg(`${result.count} clusters found`)
      setTimeout(() => setRunMsg(''), 4000)
    } finally {
      setRunning(false)
    }
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Open a project to view topic clusters.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Topic Clusters</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Keywords grouped by semantic + domain overlap
          </p>
        </div>
        <div className="flex items-center gap-3">
          {runMsg && <span className="text-xs text-green-600">{runMsg}</span>}
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors font-medium"
          >
            {running ? 'Clustering…' : 'Run Clustering'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-xs">
            Loading…
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400 text-sm">
            <span className="text-2xl">🗂</span>
            <span>No clusters yet.</span>
            <span className="text-xs text-gray-300">
              Run clustering after your keywords have finished processing.
            </span>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 w-44">
                  Topic Label
                </th>
                <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50">
                  Keywords
                </th>
                <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 w-44">
                  Est. Monthly Traffic
                </th>
                <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 w-48">
                  Most Shown
                </th>
                <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 w-48">
                  Highest Ranking
                </th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  onLabelChange={() => queryClient.invalidateQueries({ queryKey: ['topics'] })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Topic row ────────────────────────────────────────────────────────────────

function TopicRow({
  topic,
  onLabelChange
}: {
  topic: TopicRow
  onLabelChange: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(topic.label)

  const { data: keywords = [] } = useQuery({
    queryKey: ['topics', topic.id, 'keywords'],
    queryFn: () => window.api.getTopicKeywords(topic.id)
  })

  useEffect(() => {
    if (!editing) setDraft(topic.label)
  }, [topic.label, editing])

  async function save(): Promise<void> {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed || trimmed === topic.label) return
    await window.api.updateTopicLabel(topic.id, trimmed)
    onLabelChange()
  }

  return (
    <tr className="border-b border-gray-100 align-top hover:bg-gray-50 transition-colors">
      {/* Label */}
      <td className="px-4 py-3">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setDraft(topic.label); setEditing(false) }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full px-2 py-1 text-xs border border-blue-400 rounded outline-none text-gray-900 bg-white"
          />
        ) : (
          <div className="flex items-start gap-2 group">
            <span className="text-xs font-medium text-gray-800">{topic.label}</span>
            <button
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 text-xs transition-opacity shrink-0 mt-px"
              title="Edit label"
            >
              ✎
            </button>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-1">{topic.memberCount} keywords</div>
      </td>

      {/* Keywords — vertical list with volume + intent */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {keywords.map((kw: TopicKeywordRow) => (
            <div key={kw.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-700 font-mono">{kw.keyword}</span>
              {kw.searchVolume != null && (
                <span className="text-xs text-gray-400 tabular-nums shrink-0">
                  {kw.searchVolume.toLocaleString()}/mo
                </span>
              )}
              {kw.searchIntent && (
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize shrink-0 ${INTENT_COLORS[kw.searchIntent] ?? 'bg-gray-100 text-gray-600'}`}>
                  {kw.searchIntent}
                </span>
              )}
            </div>
          ))}
        </div>
      </td>

      {/* Est. Monthly Traffic */}
      <td className="px-4 py-3 text-right tabular-nums">
        {topic.totalSearchVolume != null
          ? <span className="text-xs text-gray-700">{topic.totalSearchVolume.toLocaleString()}</span>
          : <span className="text-xs text-gray-300">—</span>
        }
      </td>

      {/* Most shown domain */}
      <td className="px-4 py-3">
        {topic.topDomain ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-800 font-mono truncate max-w-36" title={topic.topDomain}>
              {topic.topDomain}
            </span>
            <span className="shrink-0 text-xs text-gray-400 tabular-nums">
              ×{topic.topDomainCount}
            </span>
          </div>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>

      {/* Highest ranking domain */}
      <td className="px-4 py-3">
        {topic.bestDomain ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold shrink-0">
              {topic.bestDomainPosition}
            </span>
            <span className="text-xs text-gray-800 font-mono truncate max-w-32" title={topic.bestDomain}>
              {topic.bestDomain}
            </span>
          </div>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
    </tr>
  )
}
