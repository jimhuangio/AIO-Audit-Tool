// DataForSEO REST API client — direct HTTP, no MCP server subprocess.
// Auth: Authorization: Basic <base64(login:password)>
// Get your key: btoa('your@email.com:yourpassword')  OR copy from the DataForSEO dashboard.

import { fetch } from 'undici'

const DFS_BASE = 'https://api.dataforseo.com'
const TIMEOUT_MS = 30_000

export interface SERPPayload {
  keyword: string
  locationCode: number
  languageCode: string
  device: string
}


export class DataForSEOClient {
  private apiKey: string | null = null

  // apiKey = base64-encoded "login:password"
  connect(apiKey: string): void {
    if (!apiKey.trim()) throw new Error('API key is empty')
    this.apiKey = apiKey.trim()
  }

  disconnect(): void {
    this.apiKey = null
  }

  isConnected(): boolean {
    return !!this.apiKey
  }

  // Validate the key with a cheap GET call (no SERP credit consumed)
  async testConnection(): Promise<{ ok: boolean }> {
    await this.get('/v3/appendix/user_data')
    return { ok: true }
  }

  async fetchSERP(payload: SERPPayload): Promise<unknown> {
    return this.post('/v3/serp/google/organic/live/advanced', [
      {
        keyword:                  payload.keyword,
        location_code:            payload.locationCode,
        language_code:            payload.languageCode,
        device:                   payload.device,
        depth:                    100,
        load_async_ai_overview:   true
      }
    ])
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${DFS_BASE}${path}`, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status} on GET ${path}`)
    const data = await res.json() as any
    if (data.status_code !== 20000) {
      throw new Error(`DataForSEO error ${data.status_code}: ${data.status_message}`)
    }
    return data
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${DFS_BASE}${path}`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status} on POST ${path}`)
    const data = await res.json() as any
    if (data.status_code !== 20000) {
      throw new Error(`DataForSEO error ${data.status_code}: ${data.status_message}`)
    }
    return data
  }

  private authHeaders(): Record<string, string> {
    if (!this.apiKey) throw new Error('DataForSEO not connected — call connect(apiKey) first')
    return { Authorization: `Basic ${this.apiKey}` }
  }
}

export const mcpClient = new DataForSEOClient()
