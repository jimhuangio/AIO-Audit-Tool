// Crawl scheduler: fetches uncrawled AIO source URLs, extracts sections,
// runs snippet matching, stores results. Per-domain rate limiting.
import { fetch } from 'undici'
import { extractPageContent, extractPageContentFromMarkdown } from './extract'
import { firecrawlScrape } from './firecrawl-client'
import { readAllCredentials } from '../credentials'
import { matchSnippetToSections } from './snippet-match'
import {
  getUncrawledAIOUrls,
  insertCrawledPage,
  insertPageSections,
  insertSnippetMatches,
  getAIOSourcesForUrl,
  getCrawlStats
} from '../db'
import type { BrowserWindow } from 'electron'

const DEFAULT_CONCURRENCY  = 3
const DOMAIN_DELAY_MS      = 2500   // min ms between requests to the same domain
const REQUEST_TIMEOUT_MS   = 15_000
const USER_AGENT           = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// Domains that are always JS-rendered and will never yield content via direct fetch
const JS_ONLY_DOMAINS = new Set([
  'youtube.com', 'www.youtube.com',
  'twitter.com', 'x.com',
  'instagram.com', 'www.instagram.com',
  'facebook.com', 'www.facebook.com',
  'linkedin.com', 'www.linkedin.com',
  'tiktok.com', 'www.tiktok.com',
])

interface CrawlTask {
  url: string
  domain: string
}

export class CrawlScheduler {
  // Per-domain queues: round-robin dispatch with per-domain rate limiting
  private domainQueues = new Map<string, string[]>()
  private domainOrder: string[] = []   // round-robin cursor
  private domainCursor = 0
  private running = 0
  private paused = false
  private active = false
  private window: BrowserWindow | null = null
  private progressInterval: NodeJS.Timeout | null = null

  // Per-domain last-request timestamp for rate limiting
  private domainLastRequest = new Map<string, number>()

  constructor(private concurrency = DEFAULT_CONCURRENCY) {}

  setWindow(win: BrowserWindow): void {
    this.window = win
  }

  async start(): Promise<void> {
    this.active = true
    this.paused = false
    this.startProgressBroadcast()
    await this.loadQueue()
    this.drain()
  }

  pause(): void {
    this.paused = true
    this.stopProgressBroadcast()
  }

  resume(): void {
    this.paused = false
    this.startProgressBroadcast()
    this.drain()
  }

  stop(): void {
    this.active = false
    this.paused = true
    this.domainQueues.clear()
    this.domainOrder = []
    this.domainCursor = 0
    this.stopProgressBroadcast()
  }

  get isRunning(): boolean {
    return this.active && !this.paused
  }

  get queueLength(): number {
    let total = 0
    for (const q of this.domainQueues.values()) total += q.length
    return total
  }

  private async loadQueue(): Promise<void> {
    const urls = getUncrawledAIOUrls()
    this.domainQueues.clear()
    this.domainOrder = []
    this.domainCursor = 0

    for (const url of urls) {
      try {
        const domain = new URL(url).hostname
        if (!this.domainQueues.has(domain)) {
          this.domainQueues.set(domain, [])
          this.domainOrder.push(domain)
        }
        this.domainQueues.get(domain)!.push(url)
      } catch { /* skip malformed URLs */ }
    }
    console.log(`[crawl] loaded ${urls.length} uncrawled URLs across ${this.domainOrder.length} domains`)
  }

  private drain(): void {
    if (this.paused || !this.active) return

    const now = Date.now()
    let dispatched = 0
    let checked = 0
    const total = this.domainOrder.length

    while (this.running < this.concurrency && checked < total) {
      if (this.domainCursor >= this.domainOrder.length) this.domainCursor = 0
      const domain = this.domainOrder[this.domainCursor]
      const q = this.domainQueues.get(domain)

      // Remove exhausted domain from rotation
      if (!q || q.length === 0) {
        this.domainOrder.splice(this.domainCursor, 1)
        this.domainQueues.delete(domain)
        checked++
        continue
      }

      const last = this.domainLastRequest.get(domain) ?? 0
      if (now - last < DOMAIN_DELAY_MS) {
        this.domainCursor++
        checked++
        continue
      }

      const url = q.shift()!
      if (q.length === 0) {
        this.domainOrder.splice(this.domainCursor, 1)
        this.domainQueues.delete(domain)
      } else {
        this.domainCursor++
      }

      this.domainLastRequest.set(domain, now)
      this.running++
      dispatched++

      this.processURL(url)
        .catch(err => console.error(`[crawl] unhandled error for ${url}:`, err))
        .finally(() => {
          this.running--
          setImmediate(() => this.drain())
        })
    }

    // If we couldn't dispatch anything due to rate limits, retry after delay
    if (dispatched === 0 && this.queueLength > 0 && this.running < this.concurrency) {
      setTimeout(() => this.drain(), 500)
    }
  }

  private async processURL(url: string): Promise<void> {
    let statusCode = 0
    let title = ''
    let metaDesc = ''
    let errorMsg: string | null = null
    let sections: { sectionType: string; content: string; positionIdx: number }[] = []
    let isLikelyEmpty = false

    let urlDomain = ''
    try { urlDomain = new URL(url).hostname } catch { /* ignore */ }
    const isJsOnly = JS_ONLY_DOMAINS.has(urlDomain)

    // ── Step 1: Direct fetch (always, unless known JS-only domain) ────────
    if (!isJsOnly) {
      let html = ''
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
        statusCode = res.status
        const ct = res.headers.get('content-type') ?? ''

        if (ct.includes('text/html') || ct.includes('application/xhtml')) {
          html = await res.text()
        } else if (statusCode === 200) {
          errorMsg = `non-html content-type: ${ct}`
        } else {
          errorMsg = `http ${statusCode}`
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err)
        if (errorMsg.includes('TimeoutError') || errorMsg.includes('timeout')) {
          errorMsg = 'timeout'
        }
      }

      if (html) {
        const extracted = extractPageContent(html)
        title = extracted.title
        metaDesc = extracted.metaDesc
        sections = extracted.sections
        isLikelyEmpty = extracted.isLikelyEmpty
        if (isLikelyEmpty) errorMsg = errorMsg ?? 'js-rendered (empty content)'
        else if (sections.length > 0 && errorMsg?.startsWith('http ')) errorMsg = null
      }
    } else {
      errorMsg = 'js-rendered (known JS-only domain)'
    }

    // ── Step 2: Firecrawl retry — only when direct fetch had issues ───────
    // Skip for permanent failures (404, 410, 5xx, non-HTML) where Firecrawl won't help.
    const firecrawlKey = readAllCredentials()['firecrawl']?.apiKey ?? ''
    const directFailed = isJsOnly || isLikelyEmpty || (sections.length === 0)
    const permanentFailure = /^(http (404|410|[45]\d\d)|non-html content-type)/.test(errorMsg ?? '')

    if (firecrawlKey && directFailed && !permanentFailure) {
      console.log(`[crawl] direct fetch insufficient for ${url} (${errorMsg ?? 'no sections'}), trying Firecrawl`)
      try {
        const result = await firecrawlScrape(url, firecrawlKey)
        statusCode = result.statusCode
        title = result.title
        metaDesc = result.metaDesc
        const extracted = extractPageContentFromMarkdown(result.markdown, title, metaDesc)
        sections = extracted.sections
        isLikelyEmpty = extracted.isLikelyEmpty
        errorMsg = isLikelyEmpty ? 'empty content (firecrawl)' : null
      } catch (err) {
        console.warn(`[crawl] Firecrawl also failed for ${url}:`, err)
        // keep original errorMsg from direct fetch
      }
    }

    // ── Store ──────────────────────────────────────────────────────────────
    if (sections.length > 0 && !isLikelyEmpty) {
      const pageId = insertCrawledPage({
        url, statusCode, title, metaDesc, errorMsg,
        rawHtml: null
      })
      if (pageId > 0) {
        insertPageSections(pageId, sections)
        await this.runSnippetMatching(url, pageId, sections)
      }
    } else {
      insertCrawledPage({ url, statusCode, title, metaDesc, errorMsg, rawHtml: null })
    }

    console.log(`[crawl] ${url} → ${statusCode}, ${sections.length} sections, err=${errorMsg ?? 'none'}`)
    this.broadcastProgress()
  }

  private async runSnippetMatching(
    url: string,
    pageId: number,
    sections: { sectionType: string; content: string; positionIdx: number }[]
  ): Promise<void> {
    // Get all AIO sources for this URL (there may be multiple keywords citing it)
    const aioSources = getAIOSourcesForUrl(url)
    if (aioSources.length === 0) return

    const matches: { aioSourceId: number; positionIdx: number; score: number; method: string }[] = []

    for (const source of aioSources) {
      if (!source.aioSnippet) continue

      const topMatches = matchSnippetToSections(source.aioSnippet, sections)
      for (const m of topMatches) {
        matches.push({
          aioSourceId: source.id,
          positionIdx: m.positionIdx,
          score: m.score,
          method: m.method
        })
      }
    }

    if (matches.length > 0) {
      insertSnippetMatches(pageId, matches)
    }
  }

  private broadcastProgress(): void {
    if (!this.window || this.window.isDestroyed()) return
    const stats = getCrawlStats()
    this.window.webContents.send('crawl:progress', stats)
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

export const crawlScheduler = new CrawlScheduler()
