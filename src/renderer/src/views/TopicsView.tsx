import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import type { TopicRow, TopicKeywordRow } from '../../../types'

export function TopicsView(): JSX.Element {
  const { project } = useAppStore()
  const queryClient = useQueryClient()
  const [selectedTopic, setSelectedTopic] = useState<TopicRow | null>(null)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState('')

  const { data: topics = [], isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: () => window.api.getTopics(),
    enabled: !!project
  })

  async function handleRun(): Promise<void> {
    setRunning(true)
    setRunMsg('')
    try {
      const result = await window.api.runTopicClustering()
      await queryClient.invalidateQueries({ queryKey: ['topics'] })
      setSelectedTopic(null)
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
    <div className="flex h-full overflow-hidden">
      {/* Left: topic list */}
      <div className="flex flex-col flex-1 min-w-0">
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
                    isSelected={selectedTopic?.id === topic.id}
                    onClick={() =>
                      setSelectedTopic(selectedTopic?.id === topic.id ? null : topic)
                    }
                    onLabelChange={(label) => {
                      queryClient.invalidateQueries({ queryKey: ['topics'] })
                      if (selectedTopic?.id === topic.id) {
                        setSelectedTopic({ ...topic, label })
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: keyword panel */}
      {selectedTopic && (
        <TopicKeywordsPanel
          topic={selectedTopic}
          onClose={() => setSelectedTopic(null)}
        />
      )}
    </div>
  )
}

// ─── Topic row with inline label editing ──────────────────────────────────────

function TopicRow({
  topic,
  isSelected,
  onClick,
  onLabelChange
}: {
  topic: TopicRow
  isSelected: boolean
  onClick: () => void
  onLabelChange: (label: string) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(topic.label)

  async function save(): Promise<void> {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed || trimmed === topic.label) return
    await window.api.updateTopicLabel(topic.id, trimmed)
    onLabelChange(trimmed)
  }

  const keywordList = topic.topKeywords ? topic.topKeywords.split('|') : []
  const extraCount = topic.memberCount - keywordList.length

  return (
    <tr
      onClick={() => !editing && onClick()}
      className={`border-b border-gray-100 cursor-pointer transition-colors align-top
        ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}
      `}
    >
      {/* Label */}
      <td className="px-4 py-2.5">
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
          <div className="flex items-center gap-2 group">
            <span className={`text-xs font-medium ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
              {topic.label}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 text-xs transition-opacity"
              title="Edit label"
            >
              ✎
            </button>
          </div>
        )}
      </td>

      {/* Keywords */}
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {keywordList.map((kw) => (
            <span
              key={kw}
              className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-mono max-w-48 truncate"
              title={kw}
            >
              {kw}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="inline-block px-1.5 py-0.5 text-gray-400 text-xs">
              +{extraCount} more
            </span>
          )}
        </div>
      </td>

      {/* Most shown domain */}
      <td className="px-4 py-2.5">
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
      <td className="px-4 py-2.5">
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

// ─── Keywords side panel ──────────────────────────────────────────────────────

function TopicKeywordsPanel({
  topic,
  onClose
}: {
  topic: TopicRow
  onClose: () => void
}): JSX.Element {
  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ['topics', topic.id, 'keywords'],
    queryFn: () => window.api.getTopicKeywords(topic.id)
  })

  return (
    <div className="w-80 shrink-0 flex flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex-1 min-w-0 pr-3">
          <div className="text-xs text-gray-400 mb-0.5">Topic</div>
          <div className="text-sm font-medium text-gray-900 truncate" title={topic.label}>
            {topic.label}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{topic.memberCount} keywords</div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-600 text-xl leading-none mt-0.5 shrink-0 transition-colors"
        >
          ×
        </button>
      </div>

      {/* Keyword list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6 text-gray-400 text-xs">Loading…</div>
        ) : keywords.length === 0 ? (
          <div className="flex justify-center p-6 text-gray-400 text-xs">No keywords found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {keywords.map((kw: TopicKeywordRow) => (
              <div key={kw.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-800 font-mono truncate">{kw.keyword}</div>
                  {kw.aioSourceCount > 0 && (
                    <div className="text-xs text-blue-500 mt-0.5">{kw.aioSourceCount} AIO sources</div>
                  )}
                </div>
                <SimBadge sim={kw.similarity} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SimBadge({ sim }: { sim: number }): JSX.Element {
  const pct = Math.round(sim * 100)
  const color =
    pct >= 70 ? 'bg-green-100 text-green-700' :
    pct >= 40 ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-500'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium tabular-nums shrink-0 ${color}`}>
      {pct}%
    </span>
  )
}
