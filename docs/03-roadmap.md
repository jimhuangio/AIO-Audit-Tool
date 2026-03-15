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

### iOS Companion (Exploratory)
- [ ] React Native or SwiftUI read-only viewer
- [ ] iCloud sync of `.aio-project.db` (or export to JSON)
- [ ] Browse: topics, position report, keyword detail
- [ ] No write/harvest on iOS (API calls stay on desktop)

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
