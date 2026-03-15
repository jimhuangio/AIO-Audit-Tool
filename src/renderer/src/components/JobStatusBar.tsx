import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { JobCounts } from '../../../types'

export function JobStatusBar(): JSX.Element {
  const { jobCounts, setJobCounts, runStatus, setRunStatus } = useAppStore()
  const [runError, setRunError] = useState<string>('')

  // Subscribe to progress events from main process
  useEffect(() => {
    const unsub = window.api.onRunProgress((counts: JobCounts) => {
      setJobCounts(counts)
    })
    return unsub
  }, [setJobCounts])

  const total = Object.values(jobCounts).reduce((a, b) => a + b, 0)
  const progress = total > 0 ? Math.round((jobCounts.done / total) * 100) : 0

  async function handleStart(): Promise<void> {
    setRunError('')
    try {
      await window.api.startRun()
      setRunStatus('running')
    } catch (err) {
      setRunError(String(err).replace('Error: ', ''))
    }
  }

  async function handlePause(): Promise<void> {
    await window.api.pauseRun()
    setRunStatus('paused')
  }

  async function handleResume(): Promise<void> {
    await window.api.resumeRun()
    setRunStatus('running')
  }

  async function handleStop(): Promise<void> {
    await window.api.stopRun()
    setRunStatus('idle')
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200">
      {/* Run controls */}
      <div className="flex items-center gap-2">
        {runStatus === 'idle' && (
          <button
            onClick={handleStart}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
          >
            ▶ Start Run
          </button>
        )}
        {runStatus === 'running' && (
          <>
            <button
              onClick={handlePause}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded transition-colors"
            >
              ⏸ Pause
            </button>
            <button
              onClick={handleStop}
              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors"
            >
              ■ Stop
            </button>
          </>
        )}
        {runStatus === 'paused' && (
          <>
            <button
              onClick={handleResume}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
            >
              ▶ Resume
            </button>
            <button
              onClick={handleStop}
              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors"
            >
              ■ Stop
            </button>
          </>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-48">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 tabular-nums">{progress}%</span>
        </div>
      )}

      {/* Run error */}
      {runError && (
        <span className="text-xs text-red-500 truncate max-w-xs" title={runError}>{runError}</span>
      )}

      {/* Status badges */}
      <div className="flex items-center gap-3 text-xs tabular-nums">
        <Badge label="Pending" value={jobCounts.pending} color="gray" />
        <Badge label="Running" value={jobCounts.running} color="blue" />
        <Badge label="Done" value={jobCounts.done} color="green" />
        <Badge label="Error" value={jobCounts.error} color="red" />
      </div>
    </div>
  )
}

function Badge({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: 'gray' | 'blue' | 'green' | 'red'
}): JSX.Element {
  const colorMap = {
    gray: 'text-gray-500',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-500'
  }
  return (
    <span className={`${colorMap[color]}`}>
      {label}: <strong>{value.toLocaleString()}</strong>
    </span>
  )
}
