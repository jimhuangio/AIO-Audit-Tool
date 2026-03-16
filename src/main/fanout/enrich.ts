// Batch-enrich all un-enriched done/error keywords with search volume + intent.
// Called automatically by the scheduler after the fanout queue drains.
import { mcpClient } from '../mcp/client'
import { getUnenrichedKeywords, upsertKeywordEnrichment, getProjectMeta } from '../db'
import { log, logError } from '../logger'

const BATCH_SIZE = 100

export async function runEnrichment(isCancelled: () => boolean): Promise<void> {
  const unenriched = getUnenrichedKeywords()
  log(`[enrich] starting — ${unenriched.length} keywords to enrich`)
  if (unenriched.length === 0) return

  const meta = getProjectMeta()
  log(`[enrich] project meta — locationCode:${meta.locationCode} languageCode:${meta.languageCode}`)

  for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
    if (isCancelled()) { log('[enrich] cancelled'); return }

    const batch = unenriched.slice(i, i + BATCH_SIZE)
    const keywords = batch.map((k) => k.keyword)
    log(`[enrich] batch ${i / BATCH_SIZE + 1} — ${keywords.length} keywords:`, keywords.slice(0, 5))

    try {
      const [volumeMap, intentMap, categoryMap] = await Promise.all([
        mcpClient.fetchSearchVolume(keywords, meta.locationCode, meta.languageCode),
        mcpClient.fetchSearchIntent(keywords, meta.languageCode),
        mcpClient.fetchCategories(keywords, meta.languageCode)
      ])

      log('[enrich] volumeMap sample:', Object.entries(volumeMap).slice(0, 5))
      log('[enrich] intentMap sample:', Object.entries(intentMap).slice(0, 5))
      log('[enrich] categoryMap sample:', Object.entries(categoryMap).slice(0, 5))

      upsertKeywordEnrichment(
        batch.map((k) => ({
          id: k.id,
          searchVolume: volumeMap[k.keyword] ?? null,
          searchIntent: intentMap[k.keyword] ?? null,
          categoryId: categoryMap[k.keyword]?.id ?? null,
          categoryName: categoryMap[k.keyword]?.name ?? null
        }))
      )
      log(`[enrich] batch ${i / BATCH_SIZE + 1} saved`)
    } catch (err) {
      logError('[enrich] batch failed', err)
    }
  }
  log('[enrich] complete')
}
