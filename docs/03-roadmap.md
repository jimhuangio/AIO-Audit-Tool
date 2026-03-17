# Roadmap — Fanout SEO

## Delivery Phases

```
Timeline (weeks from kickoff)
 ├── Week 1–2  ── Phase 1: Foundation
 ├── Week 3–5  ── Phase 2: Core MVP (AIO killer feature)
 ├── Week 6–9  ── Phase 3: Crawler + Snippet Matching
 ├── Week 10–13 ─ Phase 4: Topic Clustering
 └── Week 14+  ── Phase 5: Polish + iOS Exploration
```

---

## Phase 1 — Foundation (Weeks 1–2) ✅

**Goal:** Runnable Electron shell with SQLite and API connection.

| Task | Owner | Status |
|------|-------|--------|
| Electron + Vite + React + TS scaffold | Dev | ✅ |
| `better-sqlite3` integration + schema runner | Dev | ✅ |
| DB migration system (versioned) | Dev | ✅ |
| Project create/open (file dialog) | Dev | ✅ |
| Project settings form (creds, location, depth) | Dev | ✅ |
| DataForSEO direct HTTP client (undici + base64 auth) | Dev | ✅ |
| Global credentials store (`userData/api-credentials.json`) | Dev | ✅ |
| Typed IPC bridge (contextBridge) | Dev | ✅ |
| Basic Electron window + nav shell | Dev | ✅ |

**Exit criteria:** Can create a project file, enter API key, see "✓ Connected"

---

## Phase 2 — Core MVP: AIO Position Analysis (Weeks 3–5) ✅

**Goal:** Full harvest → AIO position heatmap pipeline working end-to-end.

| Task | Owner | Status |
|------|-------|--------|
| Keyword paste + CSV upload UI | Dev | ✅ |
| Keywords table with status badges | Dev | ✅ |
| Custom SimpleQueue (in-process, rate-limited) | Dev | ✅ |
| DataForSEO SERP Advanced fetch + raw JSON store | Dev | ✅ |
| DataForSEO PAA extraction | Dev | ✅ |
| AIO source extraction (positions 1–10) | Dev | ✅ |
| domain_root + domain_full parsing | Dev | ✅ |
| Fan-out: child keyword extraction from PAA | Dev | ✅ |
| Fan-out: INSERT OR IGNORE dedupe | Dev | ✅ |
| Fan-out: depth + cap enforcement | Dev | ✅ |
| fanout_edges population | Dev | ✅ |
| Rate limiter (configurable tasks/min) | Dev | ✅ |
| Retry / exponential backoff | Dev | ✅ |
| AIO Position heatmap table (pos1–10 × domain) | Dev | ✅ |
| Domain mode toggle (Root ↔ Subdomain) | Dev | ✅ |
| AI Visibility Score calculation | Dev | ✅ |
| Run controls (Start / Pause / Resume / Stop) | Dev | ✅ |
| Live job count badges + progress bar | Dev | ✅ |
| CSV export (position table) | Dev | ✅ |

**Exit criteria:** 100-keyword test run completes, position heatmap renders, toggle works, CSV exports ✅

---

## Phase 3 — Crawler + Snippet Matching (Weeks 6–9) ✅

**Goal:** For every cited URL, know which page section earned the citation.

| Task | Owner | Status |
|------|-------|--------|
| `undici` crawler (timeout, headers) | Dev | ✅ |
| Crawl cache check (skip known URLs) | Dev | ✅ |
| HTML section extraction (Cheerio) | Dev | ✅ |
| page_sections population | Dev | ✅ |
| TF-IDF tokenizer + Jaccard scorer | Dev | ✅ |
| Snippet → section matching | Dev | ✅ |
| snippet_matches population | Dev | ✅ |
| Crawl queue UI (separate from SERP queue) | Dev | ✅ |
| Keyword detail view (sources + matched sections) | Dev | ✅ |
| Crawl rate limiting (per-domain delay) | Dev | ✅ |
| Crawl error handling (404/403/timeout) | Dev | ✅ |

**Exit criteria:** For a keyword with AIO, can see "source URL → matched section: H2 'How to Compare Cards' (score: 0.72)" ✅

---

## Phase 4 — Topic Clustering (Weeks 10–13) ✅

**Goal:** Group keywords into meaningful topics with semantic + domain overlap analysis.

| Task | Owner | Status |
|------|-------|--------|
| Overlap coefficient + domain Jaccard clustering | Dev | ✅ |
| Suffix normalization (ing/tion/es/s) | Dev | ✅ |
| Inverted index for O(K+E) candidate generation | Dev | ✅ |
| Connected components via BFS | Dev | ✅ |
| Singleton topics (no minimum cluster size) | Dev | ✅ |
| Error-status keywords included in clustering | Dev | ✅ |
| Topic auto-labeling (top-3 N-grams) | Dev | ✅ |
| User-editable topic labels (inline) | Dev | ✅ |
| Topic table: keywords inline + domain dominance columns | Dev | ✅ |
| Topic → keyword drill-down panel | Dev | ✅ |
| Re-cluster trigger ("Run Clustering" button) | Dev | ✅ |
| DB persistence (topics + topic_keywords) | Dev | ✅ |

**Exit criteria:** 5,000-keyword project clusters into recognizable topics with member keyword drill-down ✅

---

## Post-Phase 4 — UX & Analysis Enhancements ✅

**Goal:** Deepen analysis capabilities and improve day-to-day usability.

| Task | Owner | Status |
|------|-------|--------|
| Firecrawl cloud JS-render fallback in crawler | Dev | ✅ |
| JS-only domain routing (YouTube, Twitter, etc.) | Dev | ✅ |
| Crawler progress bar accuracy (errors count toward completion) | Dev | ✅ |
| AIO Positions heatmap legend + score progress bar | Dev | ✅ |
| Keywords text filter | Dev | ✅ |
| Multi-domain comparison columns (N domains, parallel useQueries) | Dev | ✅ |
| Live domain autocomplete suggestions (getDomainSuggestions) | Dev | ✅ |
| AIO Result Count column always visible | Dev | ✅ |
| Clear Project Data (Danger Zone, FK-safe DELETE) | Dev | ✅ |
| Clear DataForSEO credentials button | Dev | ✅ |
| Column sorting on Keywords tab | Dev | ✅ |
| AIO Audit Tool rebrand + Tombo Group logo | Dev | ✅ |
| Git repository (github.com/jimhuangio/AIO-Audit-Tool) | Dev | ✅ |
| Start run error visibility in status bar | Dev | ✅ |

---

## Post-Phase 4 — Enrichment, Parallel Processing & Gemini Clustering ✅

**Goal:** Enrich keywords with volume/intent/category data; parallelize crawler with fanout; improve clustering quality with Gemini.

| Task | Owner | Status |
|------|-------|--------|
| Keyword enrichment: search volume (Google Ads API) | Dev | ✅ |
| Keyword enrichment: search intent (Labs API) | Dev | ✅ |
| Keyword enrichment: Google taxonomy category (Labs API) | Dev | ✅ |
| Schema v6: category_id + category_name columns on keywords | Dev | ✅ |
| Volume API sanitization (strip ?!+", filter >10-word keywords) | Dev | ✅ |
| Intent + categories nested response parse fix (result[0].items[]) | Dev | ✅ |
| Est. Monthly Volume + intent badge columns in Keywords view | Dev | ✅ |
| Category-based clustering partition (different taxonomy IDs never co-cluster) | Dev | ✅ |
| Gemini semantic clustering via gemini-2.5-pro REST API | Dev | ✅ |
| Gemini API key setup in Setup view (Save / Test / Clear) | Dev | ✅ |
| Parallel crawler: feedURLs() auto-starts crawler as AIO URLs are discovered | Dev | ✅ |
| Live topic clustering: scheduleRecluster() debounced every 10 completions | Dev | ✅ |
| Topics view redesign: keywords listed vertically, no side panel | Dev | ✅ |
| Est. Monthly Traffic column on Topics view (combined search_volume per topic) | Dev | ✅ |
| run:complete IPC event: auto-reset button + refresh keyword data | Dev | ✅ |
| Close project fix: crawlScheduler.stop() on project:close | Dev | ✅ |

---

## Performance Optimisation Pass ✅

**Goal:** Eliminate known performance bottlenecks before Phase 5.

| Task | Owner | Status |
|------|-------|--------|
| getClusterableKeywords N+1 → single JOIN | Dev | ✅ |
| getTopics correlated subqueries → CTE + window functions | Dev | ✅ |
| getProjectStats / getCrawlStats → single query each | Dev | ✅ |
| getUncrawledAIOUrls NOT IN → LEFT JOIN | Dev | ✅ |
| Schema v3: missing indexes on aio_sources(url) + page_sections(page_id, position_idx) | Dev | ✅ |
| Fanout meta cache (one DB read per run, not per keyword) | Dev | ✅ |
| Crawler drain O(n) findIndex → O(1) per-domain sub-queues | Dev | ✅ |
| Clustering BFS head-pointer + O(degree) similarity | Dev | ✅ |
| Keyword polling only during active run | Dev | ✅ |
| React memoization fixes (domainPositionMaps, JSON parse, content totals, topic label draft) | Dev | ✅ |

---

## Post-Phase 4 — Structured Data, Export, Intent & UX Fixes ✅

**Goal:** Structured data as a crawl signal; user-defined export paths; robust enrichment; fan-out child source options.

| Task | Owner | Status |
|------|-------|--------|
| JSON-LD structured data extraction (`@type` from `<script type="application/ld+json">`) | Dev | ✅ |
| Schema type badges in Crawler view (colour-coded by type) | Dev | ✅ |
| Per-topic schema type breakdown in HTML report | Dev | ✅ |
| Per-topic HTML element breakdown (best-performing elements) in HTML report | Dev | ✅ |
| Content brief: generate + export as HTML (auto-opens) | Dev | ✅ |
| User-defined export folder in Settings (Browse button, persisted in DB) | Dev | ✅ |
| `resolveExportPath()` helper: uses export dir or falls back to system temp | Dev | ✅ |
| fanOutCap semantics: `0` = no children, `1–98` = cap at N, `99` = unlimited | Dev | ✅ |
| DB migration 9: remap old `fan_out_cap = 0` (unlimited) → `99` | Dev | ✅ |
| Fan-out child source: "Instead of PAA" (related searches only) now working | Dev | ✅ |
| Search intent via Gemini 2.0 Flash (replaces broken DataForSEO Labs endpoint) | Dev | ✅ |
| Local rule-based intent classifier as fallback when Gemini key absent | Dev | ✅ |
| Volume API sanitizer: strip `%` in addition to `?!+"` (fixes 40501 batch rejection) | Dev | ✅ |
| Enrichment retry: up to 3 passes if keywords remain unenriched after each pass | Dev | ✅ |
| Re-enrich button in status bar (on-demand, without re-running fanout) | Dev | ✅ |
| Enrichment progress bar in Keywords view (amber pulse while fetching) | Dev | ✅ |
| DB schema v10: `export_dir` on project, `schema_types` JSON on crawled_pages | Dev | ✅ |

---

## Post-Phase 4 — Organic Rankings ✅

**Goal:** Surface organic SERP positions alongside AIO positions in the Keywords tab, with CSV export support.

| Task | Owner | Status |
|------|-------|--------|
| `organic_rankings` table + schema v11 migration | Dev | ✅ |
| `extractOrganicResults()` in `fanout/extract.ts` | Dev | ✅ |
| `insertOrganicRankings()` wired into `worker.ts` | Dev | ✅ |
| `getOrganicPositions(domain)` DB query | Dev | ✅ |
| `clearProjectData` FK-safe deletion of `organic_rankings` | Dev | ✅ |
| IPC handler `keywords:getOrganicPositions` | Dev | ✅ |
| IPC handler `keywords:exportWithDomains` (AIO + organic CSV) | Dev | ✅ |
| Preload entries: `getOrganicPositionsForDomain`, `exportKeywordsCSV` | Dev | ✅ |
| Domain chip `#` toggle + `organicDomains` state | Dev | ✅ |
| Green organic rank columns (sortable, interleaved with AIO columns) | Dev | ✅ |
| Export CSV button in Keywords toolbar | Dev | ✅ |

---

## Post-Phase 4 — Topics Category Hierarchy ✅

**Goal:** Organise topic clusters into a Gemini-generated two-level hierarchy with drag-and-drop rearranging and scoped HTML reports.

| Task | Owner | Status |
|------|-------|--------|
| `main_categories` + `sub_categories` tables + schema v12 migration | Dev | ✅ |
| `sub_category_id` FK on `topics`; FK-safe teardown in `clearTopics` + `clearProjectData` | Dev | ✅ |
| `CategoryHierarchy`, `MainCategoryRow`, `SubCategoryRow` TypeScript types | Dev | ✅ |
| `categorizeTopics()` — Gemini 2.5 Pro JSON-schema call, null fallback | Dev | ✅ |
| `runCategorisation()` wired into `topics/run.ts` after every clustering run | Dev | ✅ |
| `getFullHierarchy()` — flat CTE join; TypeScript grouping into nested object | Dev | ✅ |
| `clearAndInsertCategories()` — single transactional hierarchy write | Dev | ✅ |
| 9 DB mutation functions (rename, reorder, move, create for both levels) | Dev | ✅ |
| `categories:*` IPC handlers + `report:generateForMain` + `report:generateForSub` | Dev | ✅ |
| Preload bridge entries for all 10 new IPC channels | Dev | ✅ |
| `TopicRow.tsx`, `SubCategoryRow.tsx`, `CategoryRow.tsx` components | Dev | ✅ |
| `TopicsView.tsx` refactor: hierarchy query, collapse state, DnD, context menu, rename overlay | Dev | ✅ |
| Uncategorised bucket (dark gray header, collapsible) | Dev | ✅ |
| `topics:updated` event invalidates both `['topics']` and `['categories', 'hierarchy']` | Dev | ✅ |

---

## Phase 5 — Polish + Broader Platform (Week 14+)

### Desktop Polish
- [ ] App auto-updater (electron-updater + GitHub releases)
- [ ] First-launch onboarding wizard
- [ ] Dark mode (Tailwind dark class strategy)
- [ ] Multiple project tabs
- [ ] API cost estimator (pre-run: "~$X for N keywords × 3 task types")
- [ ] Scheduled re-runs (cron: re-fetch keywords older than N days)
- [ ] Full DB copy export (project file portability)
- [ ] Windows build (GitHub Actions CI)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DataForSEO API shape changes | Medium | High | Store raw JSON; re-parse on demand |
| AIO not present for many keywords | High | Medium | Graceful null handling; filter AIO-only view |
| Fan-out creates 100k+ keywords unexpectedly | Medium | High | Hard cap at 10k total keywords per project; warn user |
| Crawl target blocks user-agent | Medium | Medium | Rotate UA strings; add crawl4ai as fallback |
| BullMQ loses queue on crash | Low (MVP) | Medium | Phase 3: persist queue state to SQLite |
| SQLite file corruption | Low | High | Auto-backup `.db` to `.db.bak` before each run |

---

## Prioritization Principle

> **Position 1–10 AIO source analysis is the only feature clients will pay for immediately.**
> Everything else (crawler, clustering, iOS) makes it stickier but not more sellable.
> Ship Phase 2 fast, validate with real SEO users, then invest in Phase 3+.

---

*← [MVP](./02-mvp.md) | Next: [Architecture](./04-architecture.md) →*
