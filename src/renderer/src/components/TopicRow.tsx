import React from 'react'
import type { TopicRow as TopicRowData } from '../../../types'

interface Props {
  topic: TopicRowData
  onBrief: (topicId: number) => void
  onRename: (topicId: number, currentLabel: string, x: number, y: number) => void
  onDragStart: (e: React.DragEvent, topicId: number) => void
  onContextMenu: (e: React.MouseEvent, topicId: number, topicLabel: string, parentMainCategoryId: number) => void
  parentMainCategoryId: number
}

export function TopicRow({ topic, onBrief, onRename, onDragStart, onContextMenu, parentMainCategoryId }: Props): JSX.Element {
  return (
    <tr
      draggable
      onDragStart={e => onDragStart(e, topic.id)}
      onContextMenu={e => onContextMenu(e, topic.id, topic.label, parentMainCategoryId)}
      className="border-b border-gray-100 hover:bg-gray-50 cursor-grab active:cursor-grabbing"
    >
      {/* indent */}
      <td className="pl-10 pr-3 py-1.5 text-sm text-gray-800">
        <span className="text-gray-300 mr-2 select-none">⠿</span>
        <button
          onClick={e => onRename(topic.id, topic.label, e.clientX, e.clientY)}
          className="hover:underline text-left"
        >
          {topic.label}
        </button>
        {topic.topKeywords && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {topic.topKeywords.split('|').map((kw, i) => (
              <span key={i} className="text-xs text-gray-400">{kw}</span>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-1.5 text-right text-sm text-gray-500 tabular-nums">
        {topic.totalSearchVolume != null
          ? topic.totalSearchVolume.toLocaleString()
          : '—'}
      </td>
      <td className="px-3 py-1.5 text-right text-sm text-gray-500 tabular-nums">
        {topic.memberCount}
      </td>
      <td className="px-3 py-1.5 text-right text-xs text-gray-500 font-mono">
        {topic.topDomain ?? '—'}
      </td>
      <td className="px-3 py-1.5 text-right">
        {topic.bestDomainPosition != null
          ? <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">{topic.bestDomainPosition}</span>
          : <span className="text-gray-300 text-sm">—</span>}
      </td>
      {/* Brief column */}
      <td className="px-3 py-1.5 text-right">
        <button
          onClick={() => onBrief(topic.id)}
          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
        >
          Brief
        </button>
      </td>
      {/* Report column — empty for topics */}
      <td className="px-3 py-1.5" />
    </tr>
  )
}
