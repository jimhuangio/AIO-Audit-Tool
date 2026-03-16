# MVP Definition — Fanout SEO

> **MVP Goal:** A working desktop app that can ingest keywords, fetch AIO data, and display the position 1–10 domain analysis.

---

## Feature Checklist

### ✅ Phase 1 — Foundation (Complete)

- [x] **Electron + Vite + React + TS scaffold** — `electron-vite`, `@vitejs/plugin-react`
- [x] **`better-sqlite3` integration** — v12.8.0, rebuilt for Electron 33 via `npm run rebuild`
- [x] **DB schema** (10 tables: keywords, serp_results, aio_sources, paa_questions, fanout_edges, crawled_pages, page_sections, snippet_matches, topics, topic_keywords)
- [x] **DB migration runner** — versioned via `_meta.schema_version`
- [x] **Project create/open** — file dialog → `.aio-project.db`
- [x] **Project settings UI** — credentials, location, language, device, fan-out depth/cap, exclusion keywords
- [x] **MCP client** — DataForSEO MCP via stdio `child_process`, CJS-compatible import path
- [x] **Connection test + "List Available Tools"** — in Setup view, logs tool table to DevTools
- [x] **Typed IPC bridge** — `contextBridge` → `window.api`, full TypeScript types in `src/types/index.ts`
- [x] **Launcher** — `Fanout.command` double-click launcher with first-run dependency check
- [x] **`.gitignore`** — excludes `node_modules`, `out`, `*.aio-project.db`

### ✅ Phase 2 — Core MVP (Scaffold Complete, Needs Live API Test)

#### Keyword Input
- [x] **Text paste input** — textarea → line/comma split → INSERT OR IGNORE
- [x] **Input deduplication** — UNIQUE constraint on `keywords.keyword`
- [x] **Insert result feedback** — shows "+N new (M dupes skipped)"
- [x] **Keyword queue table** — status badges, depth, AIO source count, live polling every 3s

#### DataForSEO Integration
- [x] **MCP client connection** — spawn `npx @dataforseo/mcp-server` with env creds
- [x] **`listTools()` method** — call from DevTools to discover actual tool names
- [x] **`fetchSERP()`** — wraps SERP Advanced tool (tool name needs live verification)
- [x] **`fetchAIMode()`** — wraps AI Mode tool (tool name needs live verification)
- [x] **Retry logic** — inline exponential backoff, 3 attempts SERP / 2 attempts AI Mode
- [x] **Raw JSON stored first** — `serp_results` table captures full response before extraction

#### Fan-Out Engine
- [x] **Custom queue** — `SimpleQueue` class (no external deps, rate-limited, pause/resume)
- [x] **Fan-out worker** — `processKeyword()`: fetch → extract → store → create children
- [x] **Child keyword extraction** — from PAA questions + AI Mode follow-ups
- [x] **Exclusion keyword filtering** — checked in `insertChildKeywords()` before DB insert
- [x] **Deduplication** — INSERT OR IGNORE; only newly inserted IDs get enqueued
- [x] **Depth + cap enforcement** — `depth < fanOutDepth`, `slice(0, fanOutCap)`
- [x] **`fanout_edges` population** — parent→child with source type ('paa' | 'ai_mode_followup')

#### AIO Source Extraction
- [x] **`extractAIOSources()`** — parses `ai_overview` item from SERP response
- [x] **`extractAIModeSources()`** — parses AI Mode overview sources
- [x] **`extractPAAQuestions()`** — parses `people_also_ask` items
- [x] **`extractAIModeFollowups()`** — parses follow_up_queries array
- [x] **`domain_root` parsing** — `split('.').slice(-2).join('.')` (co.uk acceptable per decision)
- [x] **`domain_full` parsing** — strips `www.` only
- [x] **Defensive extraction** — all functions use optional chaining; handles MCP content wrapper

#### AIO Position Report
- [x] **Domain heatmap table** — domain rows × pos1–pos10 columns, heat CSS classes
- [x] **By-position tab** — filterable by position 1–10, share % column
- [x] **Domain mode toggle** — Root ↔ Subdomain, session-only Zustand state
- [x] **AI Visibility Score** — `SUM(11 - position)`, shown per domain
- [x] **Sort on all columns** — click header to sort asc/desc
- [x] **Filter by domain** — text input filters domain rows live
- [x] **CSV export** — position report + pivot export via file dialog

#### Run Management
- [x] **Start / Pause / Resume / Stop** — `FanoutScheduler` controls
- [x] **Live job count badges** — pending / running / done / error
- [x] **Progress bar** — done / total percentage
- [x] **IPC progress events** — main → renderer every 2 seconds via `run:progress`

---

### ✅ Phase 2 — Complete

- [x] **Keyword detail panel** — click keyword → see its AIO sources + PAA questions + children
- [x] **Project stats in sidebar** — live counts (keywords with AIO, unique domains)
- [x] **Raw JSON inspector** — view stored API response for any keyword (debug tool names)
- [x] **CSV upload** — CSV file → detect keyword column, strip BOM
- [x] **Direct HTTP client** — `undici` fetch to DataForSEO REST API; `Authorization: Basic <base64>`
- [x] **Global credentials store** — `userData/api-credentials.json`; Save + Test buttons always visible in Setup

---

### ✅ Phase 3 — Crawler + Snippet Matching (Complete)

- [x] **URL crawler** — `undici` fetch, per-domain rate limiting (2.5s), 15s timeout, JS-SPA detection
- [x] **Firecrawl fallback** — cloud JS-render API retried when direct fetch returns empty or JS-rendered content; permanent failures (404/410/5xx, non-HTML) skip Firecrawl; all URLs now go through direct fetch first
- [x] **403 handling** — attempts HTML extraction regardless of status code; clears error if real content found
- [x] **Section extraction** — `cheerio` parses h1–h6, p, li, blockquote; noise removal (nav/footer/ads); `extractPageContentFromMarkdown` for Firecrawl markdown output
- [x] **Snippet matching** — TF-IDF weighted Jaccard + token overlap + bigram overlap + heading bonus
- [x] **Crawl queue UI** — Start/Pause/Resume/Stop, stats bar (Total/Crawled/Matched/Errors/Remaining), progress bar
- [x] **Progress bar accuracy** — counts `crawled + errors` toward completion; shows "Complete · N errors" in amber when done with errors
- [x] **Crawled pages table** — status code, sections count, match count, title, error; filter by ok/error/empty
- [x] **Snippet match storage** — `snippet_matches` table links `aio_source_id` → `page_section_id` with score

---

### ✅ Phase 4 — Topic Clustering (Complete)

- [x] **Clustering algorithm** — overlap coefficient (text) + domain Jaccard; connected components via BFS
- [x] **Singleton topics** — keywords that don't cluster with others appear as solo topics (no minimum cluster size)
- [x] **Error-status keywords included** — `getClusterableKeywords()` includes `status IN ('done', 'error')`
- [x] **Suffix normalization** — strips -ing, -tion, -es, -s for better cross-form token matching
- [x] **Inverted index** — O(K+E) candidate pair generation; avoids O(K²) brute-force
- [x] **Auto-labeling** — top-3 most frequent normalized tokens across cluster members
- [x] **User-editable labels** — inline edit on click, saved immediately to DB
- [x] **Topic table** — 4 columns: Topic Label, Keywords (inline chip list), Most Shown domain (×count), Highest Ranking domain (position badge)
- [x] **Keyword drill-down panel** — click topic → see member keywords with similarity badges
- [x] **Re-cluster on demand** — "Run Clustering" button clears and rebuilds all topics
- [x] **DB persistence** — `topics` + `topic_keywords` tables; survives app restart

### ✅ Post-Phase 4 — Enrichment, Parallel Processing & Gemini Clustering (Complete)

- [x] **Keyword enrichment** — after SERP harvest, each keyword is enriched with search volume, search intent, and Google taxonomy category via three parallel DataForSEO API calls
- [x] **Est. Monthly Volume column** — `keywords` table gains `search_volume`, `search_intent`, `category_id`, `category_name`; displayed in Keywords view with color-coded intent badges
- [x] **Schema v6 migration** — `ALTER TABLE keywords ADD COLUMN category_id INTEGER, category_name TEXT`
- [x] **Google Ads keyword sanitization** — strips special chars (`?!+"`), filters keywords >10 words before volume API call; maps sanitized → original via reverse lookup
- [x] **Intent field fix** — field is `keyword_intent.label` (not `main_intent`); nested response parse `result[0].items[]`
- [x] **Category-based clustering partition** — local algorithm never clusters keywords from different Google taxonomy categories; fixes "brain cancer" + "lung cancer" merging into one topic
- [x] **Gemini semantic clustering** — `gemini-2.5-pro` used for clustering when a Gemini API key is configured; falls back to local algorithm if unavailable or on error
- [x] **Gemini API key setup** — "Google Gemini" section in Setup view; Save / Test / Clear buttons; key stored in global credentials store
- [x] **Parallel crawler + fanout** — crawler auto-starts as AIO source URLs are discovered during a run (`feedURLs()` wired via `onNewURLs` callback); no need to manually start the crawler after a run
- [x] **Live topic clustering** — topics rebuild automatically every 10 completed keywords during a run (`scheduleRecluster()` debounced 2s); final recluster runs after enrichment completes
- [x] **Topics view redesign** — keywords listed vertically within each row (no side panel); Est. Monthly Traffic column shows combined search volume per topic; each keyword shows its volume (`/mo`) and intent badge inline
- [x] **`run:complete` IPC event** — main process broadcasts when run fully completes (including enrichment + final clustering); renderer resets button state and refreshes keyword data automatically
- [x] **Close project fix** — `crawlScheduler.stop()` now called on `project:close` to prevent interval firing against a closed DB

### ✅ Post-Phase 4 — UX & Analysis Enhancements (Complete)

- [x] **Keywords view text filter** — filter keyword rows by text substring in real time
- [x] **Multi-domain comparison columns** — add N domains as comparison columns; each shows AIO position badge or `—` per keyword; uses `useQueries` for parallel fetches
- [x] **Domain autocomplete** — live suggestions dropdown (Google-style) from `getDomainSuggestions()` as user types; click to add; excludes already-added domains
- [x] **AIO Result Count column** — always visible; separate from domain comparison columns
- [x] **AIO Positions heatmap legend** — color swatch strip (levels 1–9) with "Low → High" label and score formula note in filter bar
- [x] **AIO Visibility Score bar** — mini progress bar relative to max score shown in Score column
- [x] **Clear Project Data** — "Danger Zone" in Setup with two-step inline confirm; FK-safe DELETE preserves `project` settings
- [x] **Clear DataForSEO credentials** — red Clear button next to Save/Test in API Credentials section
- [x] **Column sorting on Keywords tab** — click any column header to sort asc/desc (keyword, status, depth, AIO count, domain position columns)
- [x] **AIO Audit Tool rebrand** — app renamed, Tombo Group logo added to sidebar linking to tombogroup.com
- [x] **Git repository** — private repo at github.com/jimhuangio/AIO-Audit-Tool
- [x] **Start run error display** — errors from `startRun()` surface in the job status bar rather than silently swallowed
- [x] **Bug fixes** — SQL syntax error in `getTopics` (trailing comma); SortIcon defined inside component causing 3s unmount/remount cycle

### ✅ Performance Optimisation Pass (Complete)

- [x] **`getClusterableKeywords`** — N+1 per-keyword domain query replaced with single JOIN + `GROUP_CONCAT`
- [x] **`getTopics`** — 4 correlated subqueries each re-scanning `aio_sources` per topic replaced with CTE + `ROW_NUMBER` window functions (pre-aggregate once)
- [x] **`getProjectStats`** — 4 separate `COUNT` queries merged into single multi-scalar `SELECT`
- [x] **`getCrawlStats`** — 4 separate queries merged into single multi-scalar `SELECT`
- [x] **`getUncrawledAIOUrls`** — `NOT IN` subquery replaced with `LEFT JOIN … WHERE IS NULL` (index-friendly)
- [x] **Schema v3** — added `idx_as_url ON aio_sources(url)` and `idx_ps_page_pos ON page_sections(page_id, position_idx)`
- [x] **Migration runner** — multi-statement migrations now executed one statement at a time (avoids partial-failure)
- [x] **Fanout meta cache** — `getProjectMeta()` called once at run start; cached in worker, cleared on stop
- [x] **Crawler drain** — replaced O(n) `findIndex` per dispatch with per-domain sub-queues + round-robin O(1) dispatch
- [x] **Clustering BFS** — `queue.shift()` O(n) replaced with head-pointer O(1)
- [x] **Clustering similarity** — O(n²) member-vs-all loop replaced with O(degree) edge-weight iteration
- [x] **Keyword polling** — `refetchInterval` only fires during active run (`runStatus === 'running'`); `staleTime: 2000` prevents redundant remount fetches
- [x] **`domainPositionMaps` memo** — fixed dependency on unstable `useQueries` array reference; now keys on `dataUpdatedAt` timestamps
- [x] **JSON pretty-print** — large SERP blobs no longer re-parsed on every render (`useMemo`)
- [x] **Content source totals** — `totals` + `colMaxes` loops in `ContentSourcesTable` memoized on `rows`
- [x] **Topic label draft** — `useEffect` syncs draft when `topic.label` changes externally after query refetch

### ✅ Post-Phase 4 — Organic Rankings (Complete)

- [x] **`organic_rankings` table** — schema v11 migration; stores `keyword_id`, `domain_root`, `domain_full`, `position` (from `rank_absolute`), `url`; indexed on `(keyword_id, domain_root)`
- [x] **`extractOrganicResults()`** — parses `type: 'organic'` items from DataForSEO SERP response; uses `rank_absolute` for true SERP position (1–100); reuses `parseDomainFull`/`parseDomainRoot` helpers from `fanout/extract.ts`
- [x] **Worker wiring** — `insertOrganicRankings()` called after `insertAIOSources()` in `worker.ts` for every processed keyword; forward-only (no backfill of historical `serp_results.raw_json`)
- [x] **`getOrganicPositions(domain)`** — SQL query with partial `LIKE` match (consistent with `getDomainPositions`); returns `MIN(position)` per keyword grouped by `keyword_id`
- [x] **`clearProjectData` update** — `DELETE FROM organic_rankings` runs first (FK-safe ordering before `keywords` delete)
- [x] **IPC handler `keywords:getOrganicPositions`** — exposes organic positions to renderer
- [x] **IPC handler `keywords:exportWithDomains`** — keywords CSV with `aio_<domain>` + `organic_<domain>` paired columns for all selected domains
- [x] **Preload entries** — `getOrganicPositionsForDomain` and `exportKeywordsCSV` added to `window.api`
- [x] **Domain chip `#` toggle** — `organicDomains` state in KeywordsView; `#` button on each chip highlights green when active; `removeDomain` also removes from `organicDomains`
- [x] **Organic position columns** — green `bg-green-600` badge per keyword; appears immediately after paired AIO column; sortable via `organic_<domain>` sort key; blank (not `—`) when no organic data
- [x] **Export button** — "Export CSV" in Keywords toolbar; exports all `selectedDomains` (both AIO + organic) regardless of which organic toggles are on

---

### 🔲 Phase 5 — Polish

---

## Known Issues / Watch Items

| Issue | Status | Notes |
|-------|--------|-------|
| DataForSEO MCP subprocess | ✅ Replaced | Direct REST API via `undici`; no child process needed |
| `p-queue` / `p-retry` are ESM-only | ✅ Resolved | Replaced with inline `SimpleQueue` + `withRetry()` |
| `@modelcontextprotocol/sdk` ESM | ✅ Moot | MCP approach dropped; using direct HTTP |
| `better-sqlite3` C++20 rebuild | ✅ Resolved | Use v12.8.0; run `npm run rebuild` after install |

---

*← [Project Overview](./01-project-overview.md) | Next: [Roadmap](./03-roadmap.md) →*
