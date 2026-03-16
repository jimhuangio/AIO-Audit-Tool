# Architecture — Fanout SEO

## Stack at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  RENDERER PROCESS (React + TypeScript)                      │
│  ┌──────────┐ ┌──────────────────┐ ┌─────────────────────┐ │
│  │  Zustand │ │  TanStack Query  │ │  Tailwind CSS       │ │
│  │  (state) │ │  (IPC cache)     │ │  (white theme)      │ │
│  └────┬─────┘ └──────────────────┘ └─────────────────────┘ │
└───────┼─────────────────────────────────────────────────────┘
        │ contextBridge (typed IPC)
┌───────┼─────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                     │
│  ┌────┴──────┐ ┌───────────────┐ ┌──────────────────────┐  │
│  │ IPC       │ │ SimpleQueue   │ │  DataForSEOClient    │  │
│  │ Handlers  │ │ (rate-limited)│ │  (undici HTTP)       │  │
│  └────┬──────┘ └───────┬───────┘ └──────────┬───────────┘  │
│       │                │                     │ HTTPS        │
│  ┌────┴────────────────┴──────────────────┐  │              │
│  │  better-sqlite3 (.aio-project.db)      │  │              │
│  └────────────────────────────────────────┘  │              │
└──────────────────────────────────────────────┼──────────────┘
                                               ▼
                                     DataForSEO REST API
                                     /v3/serp/google/organic/
                                       live/advanced
```

---

## Technology Decisions

### 1. Electron over Tauri

**Decision:** Electron + React + TypeScript

| Factor | Electron | Tauri |
|--------|----------|-------|
| SQLite access | `better-sqlite3` (native Node, sync API) | Rust FFI bridge required |
| Crawler | `undici` (Node built-in) | Rust HTTP or JS via WRY |
| npm ecosystem | Full access | JS side only |
| Build complexity | Moderate | Higher (Rust toolchain) |
| Bundle size | ~150MB | ~10MB |
| Dev speed | Faster | Slower |

**Rationale:** `better-sqlite3`'s synchronous API is perfect for a desktop app — no async overhead for DB reads in IPC handlers. The 150MB bundle size is acceptable for a professional desktop tool (Screaming Frog is 200MB+).

### 2. better-sqlite3 over node-sqlite3

**Decision:** `better-sqlite3` (synchronous)

- Synchronous reads = simpler IPC handlers (no callback/promise chains)
- 2–5× faster than async drivers for read-heavy workloads
- `db.prepare().all()` is trivially cacheable
- Transactions are explicit and clean: `db.transaction(() => {...})()`

### 3. Custom SimpleQueue for Job Queue

**Decision:** Custom `SimpleQueue` class (no BullMQ, no external deps)

- Rate-limited (300 tasks/min), pausable, resumable
- Avoids ESM-only `p-queue` / `p-retry` compatibility issues in Electron
- Job state tracked directly in `keywords.status` column (pending → queued → running → done/error)
- Retry logic is inline: `withRetry(fn, maxAttempts)`

### 4. Zustand over Redux/Context

**Decision:** Zustand

- Zero boilerplate
- Domain mode toggle is the only true global state
- No middleware needed for session-only state
- `create<AppState>()` without `persist()` = guaranteed reset on restart

**Critical rule:** `domainMode` is NEVER passed to `persist()`. It must reset to `"root"` on every app start. This is a product requirement, not just a preference.

### 5. Global API Credentials Store

**Decision:** `<userData>/api-credentials.json` — app-level, not per-project

**File location:** `~/Library/Application Support/fanout-seo/api-credentials.json` (macOS)

**Format:**
```json
{
  "dataforseo": { "apiKey": "<base64(login:password)>" },
  "gemini":     { "apiKey": "AIza..." }
}
```

**Rationale:**
- API keys are personal and machine-specific — they don't belong inside a project file
- Users shouldn't re-enter credentials for every new project
- The project `.db` file can still override (per-project credentials take precedence over global)
- Fallback chain: project credentials → global credentials → error

**IPC API:**
```typescript
getAllCredentials(): Promise<Record<string, Record<string, string>>>
saveCredentials(service: string, fields: Record<string, string>): Promise<void>
removeCredentials(service: string): Promise<void>
```

**UI:** Setup view → "API Credentials" section (always visible, above project settings).
Dedicated form for DataForSEO; generic key-value row editor for any other service.

---

### 6. One SQLite File Per Project

**Decision:** `.aio-project.db` = complete project

**Rationale (Screaming Frog model):**
- User knows exactly where their data is
- Share a project = send one file
- Backup = copy one file
- No "which database server?" support burden
- SQLite handles millions of rows easily for this use case

---

## Database Schema

### Entity Relationship Overview

```
project (1)
  └── keywords (N)          ← input + fan-out discovered
        ├── serp_results     ← raw API JSON blobs
        ├── aio_sources      ← extracted pos 1-10 citations
        ├── paa_questions    ← extracted PAA items
        └── fanout_edges     ← parent→child keyword graph

crawled_pages (1)
  └── page_sections (N)     ← extracted h1-h6, p, li

aio_sources (1)
  └── snippet_matches (N)   ← aio_source → best page_section

topics (1)
  └── topic_keywords (N)    ← keyword cluster membership
```

### Table Definitions (Reference)

See the full schema in `src/main/db/schema.ts`. Summary:

| Table | Rows (typical) | Key Columns |
|-------|---------------|-------------|
| `project` | 1 | settings, credentials |
| `keywords` | 1k–100k | keyword, depth, status, parent_id, search_volume, search_intent, category_id, category_name |
| `serp_results` | 3× keywords | result_type, raw_json |
| `aio_sources` | ≤10× keywords | position, url, domain_root, domain_full |
| `paa_questions` | 0–8× keywords | question, ai_answer |
| `fanout_edges` | varies | parent_keyword_id, child_keyword_id, source |
| `crawled_pages` | ≤ unique URLs | url, status_code, title |
| `page_sections` | 50–500× pages | section_type, content, position_idx |
| `snippet_matches` | ≤3× aio_sources | match_score, match_method |
| `topics` | 5–50 | label, keywords JSON |
| `topic_keywords` | = keywords | similarity score |

**Schema v6 additions:**
```sql
ALTER TABLE keywords ADD COLUMN category_id   INTEGER;
ALTER TABLE keywords ADD COLUMN category_name TEXT;
```

**Schema v8–v10 additions:**
```sql
-- v8: user-defined HTML export directory
ALTER TABLE project ADD COLUMN export_dir TEXT NOT NULL DEFAULT '';
-- v9: remap old fan_out_cap = 0 (was "unlimited") → 99
UPDATE project SET fan_out_cap = 99 WHERE fan_out_cap = 0;
-- v10: JSON-LD structured data types per crawled page
ALTER TABLE crawled_pages ADD COLUMN schema_types TEXT NOT NULL DEFAULT '[]';
```

### Critical Indexes

```sql
-- Hot path: AIO position report (root mode)
CREATE INDEX idx_as_domain_r ON aio_sources(domain_root, position);
-- Hot path: AIO position report (subdomain mode)
CREATE INDEX idx_as_domain_f ON aio_sources(domain_full, position);
-- Hot path: keyword queue management
CREATE INDEX idx_kw_status ON keywords(status);
-- Hot path: fan-out tree traversal
CREATE INDEX idx_kw_parent ON keywords(parent_id);
-- Schema v3: crawler URL lookup (getAIOSourcesForUrl, getUncrawledAIOUrls)
CREATE INDEX idx_as_url ON aio_sources(url);
-- Schema v3: snippet match section lookup (insertSnippetMatches)
CREATE INDEX idx_ps_page_pos ON page_sections(page_id, position_idx);
```

---

## IPC API Contract

All renderer↔main communication goes through `window.api` (contextBridge).

```typescript
interface FanoutAPI {
  // Project
  createProject(name: string): Promise<ProjectMeta | null>
  openProject(): Promise<ProjectMeta | null>
  closeProject(): Promise<void>
  getProjectMeta(): Promise<ProjectMeta>
  getProjectStats(): Promise<ProjectStats>
  updateProjectSettings(settings: Partial<ProjectMeta>): Promise<ProjectMeta>

  // API connection
  mcpTestKey(apiKey: string): Promise<{ ok: boolean }>    // test key without open project
  mcpConnect(): Promise<{ connected: boolean }>
  mcpDisconnect(): Promise<void>
  mcpIsConnected(): Promise<{ connected: boolean }>

  // Keywords
  insertKeywords(rawText: string): Promise<{ inserted: number; total: number }>
  getKeywordRows(limit?: number, offset?: number): Promise<KeywordRow[]>
  getKeywordsForDomain(domain: string): Promise<KeywordRow[]>
  getDomainPositions(domain: string): Promise<{ keywordId: number; position: number }[]>
  getDomainSuggestions(partial: string): Promise<string[]>
  getJobCounts(): Promise<JobCounts>
  uploadKeywordsCSV(): Promise<{ inserted: number; total: number } | null>

  // Project data management
  clearProjectData(): Promise<void>   // FK-safe DELETE of research tables; preserves project settings

  // Run control
  startRun(config?: Partial<RunConfig>): Promise<{ started: boolean }>
  pauseRun(): Promise<{ paused: boolean }>
  resumeRun(): Promise<{ resumed: boolean }>
  stopRun(): Promise<{ stopped: boolean }>
  onRunProgress(cb: (counts: JobCounts) => void): () => void  // returns unsubscribe

  // Reports
  getAIOPositionReport(useSubdomain: boolean): Promise<AIOPositionRow[]>
  getAIODomainPivot(useSubdomain: boolean): Promise<AIODomainPivotRow[]>

  // Keyword detail
  getKeywordAIOSources(keywordId: number): Promise<AIOSourceRow[]>
  getKeywordPAAQuestions(keywordId: number): Promise<PAAQuestionRow[]>
  getKeywordChildren(keywordId: number): Promise<ChildKeywordRow[]>
  getKeywordRawJson(keywordId: number, resultType: string): Promise<string | null>

  // Crawler
  startCrawl(): Promise<{ started: boolean }>
  pauseCrawl(): Promise<{ paused: boolean }>
  resumeCrawl(): Promise<{ resumed: boolean }>
  stopCrawl(): Promise<{ stopped: boolean }>
  getCrawlStats(): Promise<CrawlStats>
  getCrawledPages(limit?: number, offset?: number): Promise<CrawledPageRow[]>
  getSnippetMatches(keywordId: number): Promise<SnippetMatchRow[]>
  onCrawlProgress(cb: (stats: CrawlStats) => void): () => void

  // Topics
  runTopicClustering(): Promise<{ count: number }>
  getTopics(): Promise<TopicRow[]>
  getTopicKeywords(topicId: number): Promise<TopicKeywordRow[]>
  updateTopicLabel(topicId: number, label: string): Promise<void>

  // Gemini
  geminiTestKey(apiKey: string): Promise<void>

  // Events (main → renderer)
  onRunComplete(cb: () => void): () => void      // run fully finished; reset button + refresh keywords
  onTopicsUpdated(cb: () => void): () => void    // live recluster during run; refresh topics view

  // Export
  exportCSV(table: string, useSubdomain: boolean): Promise<string | null>
  exportProjectCopy(): Promise<string | null>

  // Global credentials
  getAllCredentials(): Promise<Record<string, Record<string, string>>>
  saveCredentials(service: string, fields: Record<string, string>): Promise<void>
  removeCredentials(service: string): Promise<void>
}
```

---

## Fan-Out Data Flow

```
Input Keywords
      │
      ▼
INSERT OR IGNORE → keywords table (depth=0)
      │
      ▼
SimpleQueue: enqueue each keyword
      │
      ▼ (worker, up to N concurrent, rate-limited)
┌─────────────────────────────────────────┐
│  For each keyword:                      │
│  1. Fetch SERP Advanced (single call)   │
│  2. Store raw JSON → serp_results       │
│  3. Extract → aio_sources (pos 1-10)    │
│  4. Extract → paa_questions             │
│  5. If depth < maxDepth:               │
│     a. Extract child keywords (PAA)     │
│     b. INSERT OR IGNORE → keywords     │
│     c. INSERT → fanout_edges           │
│     d. Enqueue new keywords            │
│  6. Mark keyword status = 'done'       │
└─────────────────────────────────────────┘
      │
      ├─── onNewURLs callback ──────────────────────────────►
      │                                              CrawlScheduler.feedURLs()
      │                                              (auto-starts crawler;
      │                                               runs in PARALLEL with fanout)
      ▼
Enrichment (after all SERP work done)
  1. Gemini 2.0 Flash: classify all keywords by intent (batches of 200)
     → local rule-based classifier if Gemini unavailable
  Per-batch parallel API calls:
  2. DataForSEO Google Ads: search_volume
  3. DataForSEO Labs: category_id + category_name
  → upsertKeywordEnrichment() with COALESCE → keywords table
  Retries up to 3× if keywords remain unenriched

      │  (every 10 completions during run, debounced 2s)
      ▼
Topic Clustering (auto + on-demand)
  If Gemini key configured:
    clusterWithGemini() via gemini-2.5-pro REST API
    → JSON schema response → Cluster[]
  Else:
    clusterKeywords() — local overlap coefficient + BFS
    (partitioned by category_id — different categories never cluster)
  → Clear + write topics + topic_keywords
  → broadcast topics:updated → renderer refreshes Topics view

      │
      ▼
run:complete IPC event → renderer resets button state + refreshes keywords
```

---

## Domain Mode Toggle — Architecture

This is deceptively simple but architecturally important.

```typescript
// State lives ONLY in Zustand (renderer memory)
// It is NEVER written to SQLite, localStorage, or any file

// The toggle changes the SQL query parameter, not the data
const domainCol = useSubdomain ? "domain_full" : "domain_root"

// TanStack Query key includes domainMode → auto-refetches on toggle
const { data } = useQuery({
  queryKey: ["aio-positions", domainMode],  // ← key changes → refetch
  queryFn: () => window.api.getAIOPositionReport(domainMode === "subdomain"),
})
```

**Why not store both domain forms in a view?**
Because `domain_root` and `domain_full` are separate columns in `aio_sources`. The toggle changes which column the GROUP BY operates on. This is correct — same data, different aggregation granularity.

---

## DataForSEO HTTP Integration

**Transport:** Direct HTTPS via `undici` fetch (no child process, no MCP)
**Auth:** `Authorization: Basic <base64(login:password)>` — single API key field in credentials

```
Electron Main Process
  │
  └── DataForSEOClient.fetchSERP(payload)
        │  undici fetch, Authorization header
        ▼
    DataForSEO REST API
    POST /v3/serp/google/organic/live/advanced
        │
        ▼
    Response: { tasks: [{ result: [{ items: [...] }] }] }
        │
        ▼
    extractAIOSources()   → aio_sources
    extractPAAQuestions() → paa_questions
```

**Why direct HTTP over MCP subprocess:**
- The DataForSEO MCP server is just a thin wrapper over their REST API
- `undici` is already a dependency (used by the crawler)
- Avoids `npx` cold-start latency, stdin/stdout framing, and process lifecycle management
- Base64 API key is simpler than login+password env vars

---

## Firecrawl Integration (Crawler JS-Render Fallback)

**Transport:** `undici` fetch to `https://api.firecrawl.dev/v1/scrape`
**Credential:** `firecrawl.apiKey` in global credentials store

**When Firecrawl is invoked:**
1. URL's domain is in `JS_ONLY_DOMAINS` (YouTube, Twitter/X, Instagram, Facebook, LinkedIn, TikTok) → skip direct fetch entirely
2. Direct fetch returned empty content or zero extracted sections
3. Direct fetch returned a non-permanent error (not 404/410/4xx/5xx/non-HTML)

**Firecrawl is NOT invoked for permanent failures:** 404, 410, 5xx responses, or non-HTML content types — these are written as errors immediately.

```
processURL(url)
  │
  ├── Is JS-only domain? → skip to Firecrawl
  │
  ├── Direct fetch (undici)
  │     ├── Extract sections (Cheerio)
  │     ├── Status ≥ 400 but has HTML content? → clear error, use sections
  │     └── Return sections (may be empty)
  │
  └── directFailed && !permanentFailure?
        └── Firecrawl REST POST /v1/scrape
              ├── Returns markdown → extractPageContentFromMarkdown()
              └── Upsert crawled_page + page_sections
```

**Cost management:** Firecrawl credits are consumed per call. The inverted fetch order (direct first) ensures Firecrawl is only used when necessary.

**Credential fallback chain (DataForSEO):**
1. Per-project `dfs_api_key` column in SQLite
2. Global `userData/api-credentials.json → dataforseo.apiKey`
3. Legacy: `btoa(login + ':' + password)` from old per-project fields

---

## Performance Targets

| Operation | Target | Strategy |
|-----------|--------|---------|
| AIO position report (10k keywords) | <200ms | Indexed SQL, no N+1 |
| Domain toggle re-render | <100ms | TanStack Query cache hit |
| Keyword table scroll (50k rows) | 60fps | TanStack Table virtual scroll |
| Fan-out throughput | 500 keywords/min | Rate-limited SimpleQueue concurrency |
| Crawl throughput | 2 pages/sec | Concurrent undici, per-domain round-robin |
| SQLite write throughput | 10k rows/sec | WAL mode + batched transactions |
| Keyword polling overhead | Near zero when idle | `refetchInterval` disabled unless `runStatus === 'running'` |
| Topic clustering (5k keywords) | <2s | Single-query domain load; O(degree) similarity; O(1) BFS dequeue |

```sql
-- Enable WAL mode on project open (critical for concurrent reads during writes)
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;  -- 64MB cache
```

---

## Topic Clustering Algorithm

Two clustering backends are available, selected automatically based on credentials:

### Gemini Semantic Clustering (preferred)

When a Gemini API key is present (`gemini.apiKey` in the credentials store), clustering is performed by `gemini-2.5-pro` via the Generative Language REST API.

```
clusterWithGemini(keywords, apiKey)
  │
  ├── Batch keywords into groups of ≤800
  │
  └── For each batch:
        POST /v1beta/models/gemini-2.5-pro:generateContent
        body: { generationConfig: { responseMimeType: "application/json",
                                    responseSchema, temperature: 0.1 } }
        prompt: "Group the following N SEO keywords into semantic topic clusters..."
        │
        ▼
        JSON response: { clusters: [{ label, keywords[] }] }
        │
        ▼
        Map keyword strings → IDs via case-insensitive lookup → Cluster[]
```

- Batches up to 800 keywords per API call (well within the model's context window)
- Falls back to local algorithm on any API error
- Labels are generated by the model rather than N-gram counting

### Local Clustering Algorithm (fallback)

**Algorithm:** Category partition → overlap coefficient + domain Jaccard → connected components (BFS)

```
Step 1: Partition keywords by category_id
  (keywords in different Google taxonomy categories never cluster together;
   prevents "brain cancer symptoms" + "lung cancer symptoms" merging)

Step 2: Within each partition, for pairs sharing ≥1 token OR ≥1 AIO domain:
  textScore   = |A ∩ B| / min(|A|, |B|)   ← overlap coefficient
  domainScore = |A ∩ B| / |A ∪ B|          ← Jaccard on cited domains
  combined    = textScore * 0.65 + domainScore * 0.35

  if combined ≥ 0.28: add edge A—B

Step 3: BFS over adjacency list → connected components = clusters
No minimum size — singletons produce solo topics
Cap at 300 members (keep highest-degree nodes)
Label: top-3 most frequent normalized tokens
```

**Singleton behavior:** Every keyword appears in exactly one topic. Keywords that share no tokens and no domains with any other keyword form a solo topic of size 1. This ensures 100% of input keywords are visible in the Topics view.

**Error-status keywords included:** `getClusterableKeywords()` fetches `status IN ('done', 'error')` so keywords that failed SERP lookup still participate in clustering.

**Why overlap coefficient over Jaccard for text:**
Jaccard penalises hierarchical terms ("home loan" vs "home loan requirements" → low Jaccard because the union is large). Overlap coefficient only divides by the smaller set, so sub-topic/parent-topic pairs score high.

**Suffix normalization** (applied before tokenizing):
- `-ing` → strip (applying → apply)
- `-tion/-tions` → strip (application → applicat — acceptable for matching)
- `-ies` → `-y` (countries → country)
- `-es/-s` → strip (cards → card)

**Inverted index** avoids O(K²) pairwise comparison:
- Build `token → [keyword IDs]` and `domain → [keyword IDs]`
- Only compare pairs that share at least one entry → O(K + E) where E = edges

**BFS implementation:** Uses a head-pointer index instead of `queue.shift()` to avoid O(n) array reallocation per dequeue step.

**Per-member similarity:** Computed by iterating the node's existing edge-weight map (O(degree)) rather than comparing against every other member (O(n²)). Singletons (no edges) get similarity = 0.

**`getClusterableKeywords` query:** Single SQL JOIN with `GROUP_CONCAT(DISTINCT domain_root)` — replaced the prior N+1 pattern (one query per keyword) that blocked the main process on large datasets.

**`getTopics` query:** Uses a CTE to pre-aggregate `(topic_id, domain_root, cnt, best_pos)` once, then applies `ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY ...)` to select the top/best domain per topic. This replaced four correlated subqueries that each re-scanned `aio_sources` per topic row.

---

## Keyword Enrichment

After the SERP harvest phase completes, every `done` keyword is enriched. Volume and categories come from DataForSEO; intent comes from Gemini.

| Source | API / Model | Field stored |
|--------|-------------|-------------|
| Google Ads search volume | DataForSEO `/v3/keywords_data/google_ads/search_volume/live` | `search_volume` |
| Search intent | Gemini 2.0 Flash (`gemini-2.0-flash:generateContent`) | `search_intent` (informational / navigational / commercial / transactional) |
| Google taxonomy category | DataForSEO `/v3/dataforseo_labs/google/categories_for_keywords/live` | `category_id`, `category_name` |

**Volume API sanitization:**
- Strip `?`, `!`, `+`, `"`, `%` before sending (DataForSEO rejects entire batch on any invalid character)
- Filter keywords with >10 words (Google Ads limit)
- Sanitized→original reverse map restores results back to original keyword strings

**Intent via Gemini:**
- `classifyIntentWithGemini()` batches up to 200 keywords per call with a JSON schema response
- Uses `gemini-2.0-flash` (fast, cheap) at temperature 0
- Falls back to a local rule-based classifier if Gemini key is absent or call fails
- The DataForSEO Labs intent endpoint (`/v3/dataforseo_labs/google/search_intent/live`) was removed — it returned task-level 50000 errors and frequent timeouts regardless of keyword content

**Retry logic:**
- `runEnrichmentWithRetry()` calls `runEnrichment()` up to 3 times
- After each pass, `getUnenrichedKeywords()` is checked — if any keywords still have null volume or intent, a retry is triggered
- Prevents transient API failures from leaving keywords permanently unenriched

**`getUnenrichedKeywords` condition:**
```sql
WHERE status IN ('done', 'error')
  AND (search_volume IS NULL OR search_intent IS NULL)
```
`category_id` is excluded — categories API failures should not cause indefinite re-enrichment.

**`upsertKeywordEnrichment` uses `COALESCE`:**
```sql
SET search_volume = COALESCE(?, search_volume),
    search_intent = COALESCE(?, search_intent)
```
Null values from a failed API call never overwrite previously saved good data.

---

## Parallel Processing Architecture

During a fanout run, three processes run concurrently:

```
FanoutScheduler.start()
  │
  ├── SimpleQueue: SERP harvest (rate-limited, N concurrent)
  │     │  onProgress callback → scheduleRecluster() debounced 2s every 10 completions
  │     │  onNewURLs callback → CrawlScheduler.feedURLs() → crawler auto-starts
  │     └── onDrain → startEnrichment()
  │
  ├── CrawlScheduler (auto-started by feedURLs, parallel to fanout)
  │
  └── Enrichment → final runClustering() → broadcast run:complete
```

---

*← [Roadmap](./03-roadmap.md) | Next: [Idea Inbox](./05-idea-inbox.md) →*
