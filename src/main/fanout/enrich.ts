// Batch-enrich all un-enriched done/error keywords with search volume + intent.
// Called automatically by the scheduler after the fanout queue drains.
import { mcpClient } from '../mcp/client'
import { getUnenrichedKeywords, upsertKeywordEnrichment, getProjectMeta } from '../db'
import { log, logError } from '../logger'

const BATCH_SIZE = 100

export async function runEnrichment(
  isCancelled: () => boolean,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const unenriched = getUnenrichedKeywords()
  log(`[enrich] starting — ${unenriched.length} keywords to enrich`)
  if (unenriched.length === 0) return

  const total = unenriched.length
  const meta = getProjectMeta()
  log(`[enrich] project meta — locationCode:${meta.locationCode} languageCode:${meta.languageCode}`)

  for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
    if (isCancelled()) { log('[enrich] cancelled'); return }

    const batch = unenriched.slice(i, i + BATCH_SIZE)
    const keywords = batch.map((k) => k.keyword)
    log(`[enrich] batch ${Math.floor(i / BATCH_SIZE) + 1} — ${keywords.length} keywords:`, keywords.slice(0, 5))

    // Each API call is independent — a failure in one does NOT discard data from the others.
    const empty = keywords.reduce((m, k) => { m[k] = null; return m }, {} as Record<string, null>)

    const [volumeResult, intentResult, categoryResult] = await Promise.allSettled([
      mcpClient.fetchSearchVolume(keywords, meta.locationCode, meta.languageCode),
      mcpClient.fetchSearchIntent(keywords, meta.languageCode),
      mcpClient.fetchCategories(keywords, meta.languageCode)
    ])

    const volumeMap  = volumeResult.status   === 'fulfilled' ? volumeResult.value   : empty
    const intentMap  = intentResult.status   === 'fulfilled' ? intentResult.value   : empty
    const categoryMap = categoryResult.status === 'fulfilled' ? categoryResult.value : empty

    if (volumeResult.status  === 'rejected') logError('[enrich] volume API failed',   volumeResult.reason)
    if (intentResult.status  === 'rejected') logError('[enrich] intent API failed',   intentResult.reason)
    if (categoryResult.status === 'rejected') logError('[enrich] category API failed', categoryResult.reason)

    log('[enrich] volumeMap sample:', Object.entries(volumeMap).slice(0, 5))
    log('[enrich] intentMap sample:', Object.entries(intentMap).slice(0, 5))
    log('[enrich] categoryMap sample:', Object.entries(categoryMap).slice(0, 5))

    upsertKeywordEnrichment(
      batch.map((k) => ({
        id: k.id,
        searchVolume: (volumeMap as any)[k.keyword] ?? null,
        searchIntent: (intentMap as any)[k.keyword] ?? null,
        categoryId:   (categoryMap as any)[k.keyword]?.id ?? null,
        categoryName: (categoryMap as any)[k.keyword]?.name ?? null
      }))
    )

    const done = Math.min(i + batch.length, total)
    log(`[enrich] batch done — ${done}/${total}`)
    onProgress?.(done, total)
  }
  log('[enrich] complete')
}
