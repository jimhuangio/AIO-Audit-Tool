import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import type { TopicRow, TopicKeywordRow, ContentBrief } from '../../../types'

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
  const [briefModal, setBriefModal] = useState<{ topicLabel: string; brief: ContentBrief } | null>(null)

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
      {/* Content Brief Modal */}
      {briefModal && (
        <BriefModal
          topicLabel={briefModal.topicLabel}
          brief={briefModal.brief}
          onClose={() => setBriefModal(null)}
        />
      )}

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
                  onBriefReady={(brief) => setBriefModal({ topicLabel: topic.label, brief })}
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
  onLabelChange,
  onBriefReady
}: {
  topic: TopicRow
  onLabelChange: () => void
  onBriefReady: (brief: ContentBrief) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(topic.label)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [briefError, setBriefError] = useState('')

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

  async function handleGenerateBrief(): Promise<void> {
    setGeneratingBrief(true)
    setBriefError('')
    try {
      const brief = await window.api.generateTopicBrief(topic.id)
      onBriefReady(brief)
    } catch (err) {
      setBriefError(String(err).replace('Error: ', '').slice(0, 80))
      setTimeout(() => setBriefError(''), 5000)
    } finally {
      setGeneratingBrief(false)
    }
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
        <button
          onClick={handleGenerateBrief}
          disabled={generatingBrief}
          className="mt-2 px-2 py-1 text-xs bg-gray-100 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 text-gray-500 rounded border border-gray-200 hover:border-blue-200 transition-colors"
          title="Generate content brief with Gemini"
        >
          {generatingBrief ? 'Generating…' : '✦ Generate Brief'}
        </button>
        {briefError && (
          <div className="text-xs text-red-500 mt-1 break-all">{briefError}</div>
        )}
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

// ─── Content Brief Modal ──────────────────────────────────────────────────────

function BriefModal({
  topicLabel,
  brief,
  onClose
}: {
  topicLabel: string
  brief: ContentBrief
  onClose: () => void
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[720px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Content Brief</div>
            <div className="text-sm font-semibold text-gray-900">{topicLabel}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-600 text-xl leading-none mt-0.5 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* H1 + Meta */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Recommended H1</div>
            <div className="text-base font-semibold text-gray-900">{brief.h1}</div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetaCard label="Target Audience" value={brief.targetAudience} />
            <MetaCard label="Content Type" value={brief.contentType} />
            <MetaCard label="Word Count" value={brief.wordCount} />
          </div>

          {/* Key Topics */}
          {brief.keyTopics.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Key Topics to Cover</div>
              <ul className="space-y-1">
                {brief.keyTopics.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Outline */}
          {brief.outline.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Content Outline</div>
              <div className="space-y-3">
                {brief.outline.map((section, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400 mr-2">H2</span>
                      <span className="text-sm font-medium text-gray-800">{section.heading}</span>
                    </div>
                    {section.keyPoints.length > 0 && (
                      <ul className="px-4 py-2.5 space-y-1">
                        {section.keyPoints.map((pt, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                            <span className="text-gray-300 shrink-0 mt-0.5">–</span>
                            {pt}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xs text-gray-800 font-medium">{value}</div>
    </div>
  )
}
