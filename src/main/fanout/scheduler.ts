// Simple in-process job queue — no external dependency needed.
// Concurrency + rate-limiting without p-queue (which is ESM-only).
import {
  getPendingKeywords,
  markKeywordQueued,
  getJobCounts,
  getProjectMeta
} from '../db'
import { processKeyword, setRunMeta, clearRunMeta } from './worker'
import type { BrowserWindow } from 'electron'

type Task = () => Promise<void>

class SimpleQueue {
  private queue: Task[] = []
  private running = 0
  private paused = false
  private tokenBucket: number
  private lastRefill: number

  constructor(
    private concurrency: number,
    private tokensPerMinute: number
  ) {
    this.tokenBucket = tokensPerMinute
    this.lastRefill = Date.now()
  }

  get size(): number {
    return this.queue.length + this.running
  }

  add(task: Task): void {
    this.queue.push(task)
    this.drain()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.drain()
  }

  clear(): void {
    this.queue = []
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = Math.floor((elapsed / 60_000) * this.tokensPerMinute)
    if (tokensToAdd > 0) {
      this.tokenBucket = Math.min(this.tokensPerMinute, this.tokenBucket + tokensToAdd)
      this.lastRefill = now
    }
  }

  private drain(): void {
    if (this.paused) return

    this.refillTokens()

    while (
      this.queue.length > 0 &&
      this.running < this.concurrency &&
      this.tokenBucket > 0
    ) {
      const task = this.queue.shift()!
      this.running++
      this.tokenBucket--

      task()
        .catch((err) => console.error('[queue] task error:', err))
        .finally(() => {
          this.running--
          // Schedule next drain after a tick to avoid stack overflow
          setImmediate(() => this.drain())
        })
    }

    // If rate-limited, retry after tokens refill
    if (this.queue.length > 0 && this.running < this.concurrency && this.tokenBucket === 0) {
      const msPerToken = 60_000 / this.tokensPerMinute
      setTimeout(() => this.drain(), msPerToken)
    }
  }
}

export class FanoutScheduler {
  private queue: SimpleQueue
  private window: BrowserWindow | null = null
  private running = false
  private progressInterval: NodeJS.Timeout | null = null

  constructor(
    private concurrency = 5,
    private tasksPerMinute = 300
  ) {
    this.queue = new SimpleQueue(concurrency, tasksPerMinute)
  }

  setWindow(win: BrowserWindow): void {
    this.window = win
  }

  async start(): Promise<void> {
    setRunMeta(getProjectMeta())
    this.running = true
    this.startProgressBroadcast()
    this.drainPending()
  }

  pause(): void {
    this.running = false
    this.queue.pause()
    this.stopProgressBroadcast()
    console.log('[scheduler] paused')
  }

  resume(): void {
    this.running = true
    this.queue.resume()
    this.startProgressBroadcast()
    this.drainPending()
    console.log('[scheduler] resumed')
  }

  stop(): void {
    this.running = false
    this.queue.pause()
    this.queue.clear()
    this.stopProgressBroadcast()
    clearRunMeta()
    console.log('[scheduler] stopped')
  }

  get isRunning(): boolean {
    return this.running
  }

  // Called by worker when it discovers new child keywords
  addChildren(childIds: number[]): void {
    if (!this.running) return
    for (const id of childIds) {
      markKeywordQueued(id)
      this.queue.add(() =>
        processKeyword(id, {
          onChildrenAdded: (ids) => this.addChildren(ids),
          onProgress: () => this.broadcastProgress()
        })
      )
    }
  }

  private drainPending(): void {
    const pending = getPendingKeywords()
    console.log(`[scheduler] draining ${pending.length} pending keywords`)

    for (const kw of pending) {
      if (!this.running) break
      markKeywordQueued(kw.id)
      this.queue.add(() =>
        processKeyword(kw.id, {
          onChildrenAdded: (ids) => this.addChildren(ids),
          onProgress: () => this.broadcastProgress()
        })
      )
    }
  }

  private broadcastProgress(): void {
    if (!this.window || this.window.isDestroyed()) return
    const counts = getJobCounts()
    this.window.webContents.send('run:progress', counts)
  }

  private startProgressBroadcast(): void {
    this.stopProgressBroadcast()
    this.progressInterval = setInterval(() => this.broadcastProgress(), 2000)
  }

  private stopProgressBroadcast(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
  }
}

export const scheduler = new FanoutScheduler()
