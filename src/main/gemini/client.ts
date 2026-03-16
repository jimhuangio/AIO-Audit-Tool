// Gemini API client — used for semantic keyword clustering.
// Uses gemini-2.5-pro with JSON response schema for reliable structured output.
import { fetch } from 'undici'
import type { Cluster } from '../topics/cluster'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS  = 120_000

export async function testGeminiKey(apiKey: string): Promise<void> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with the word OK.' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }),
      signal: AbortSignal.timeout(15_000)
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`)
  }
}

// Send up to 800 keywords per call — well within Gemini 2.0 Flash's context window.
// Larger sets are split into batches; each batch is clustered independently.
const BATCH_SIZE = 800

export async function clusterWithGemini(
  keywords: { id: number; keyword: string }[],
  apiKey: string
): Promise<Cluster[]> {
  if (keywords.length === 0) return []

  const allClusters: Cluster[] = []

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE)
    const clusters = await clusterBatch(batch, apiKey)
    allClusters.push(...clusters)
  }

  return allClusters.sort((a, b) => b.members.length - a.members.length)
}

async function clusterBatch(
  keywords: { id: number; keyword: string }[],
  apiKey: string
): Promise<Cluster[]> {
  const kwMap = new Map(keywords.map(k => [k.keyword.toLowerCase().trim(), k.id]))

  const prompt =
    `Group the following ${keywords.length} SEO keywords into semantic topic clusters.\n\n` +
    `Rules:\n` +
    `- Keywords about different specific subjects must be in different clusters (e.g. "brain cancer symptoms" and "lung cancer symptoms" are different clusters)\n` +
    `- Give each cluster a short, descriptive label (2-5 words)\n` +
    `- Every keyword must appear in exactly one cluster\n` +
    `- Singletons are fine\n\n` +
    `Keywords:\n` +
    keywords.map((k, i) => `${i + 1}. ${k.keyword}`).join('\n')

  const responseSchema = {
    type: 'object',
    properties: {
      clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label:    { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } }
          },
          required: ['label', 'keywords']
        }
      }
    },
    required: ['clusters']
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.1
        }
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data    = await res.json() as any
  const text    = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')

  const parsed  = JSON.parse(text) as { clusters: { label: string; keywords: string[] }[] }

  return (parsed.clusters ?? []).map(c => {
    const members = c.keywords
      .map(kw => {
        const id = kwMap.get(kw.toLowerCase().trim())
        return id !== undefined ? { id, similarity: 1.0 } : null
      })
      .filter((m): m is { id: number; similarity: number } => m !== null)

    return { label: c.label, keywords: c.keywords, members }
  }).filter(c => c.members.length > 0)
}
