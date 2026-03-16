// Async clustering entry point.
// Uses Gemini when an API key is configured; falls back to the local algorithm.
import { clusterKeywords } from './cluster'
import { clusterWithGemini } from '../gemini/client'
import { readAllCredentials } from '../credentials'
import { log, logError } from '../logger'
import type { ClusterInput, Cluster } from './cluster'

export async function runClustering(inputs: ClusterInput[]): Promise<Cluster[]> {
  const geminiKey = readAllCredentials()['gemini']?.apiKey ?? ''

  if (geminiKey) {
    log(`[topics] clustering ${inputs.length} keywords with Gemini`)
    try {
      const clusters = await clusterWithGemini(
        inputs.map(k => ({ id: k.id, keyword: k.keyword })),
        geminiKey
      )
      log(`[topics] Gemini returned ${clusters.length} clusters`)
      return clusters
    } catch (err) {
      logError('[topics] Gemini clustering failed, falling back to local', err)
      const clusters = clusterKeywords(inputs)
      log(`[topics] local fallback returned ${clusters.length} clusters`)
      return clusters
    }
  }

  log(`[topics] clustering ${inputs.length} keywords with local algorithm`)
  const clusters = clusterKeywords(inputs)
  log(`[topics] local algorithm returned ${clusters.length} clusters`)
  return clusters
}
