# Fanout SEO — Documentation Index

> **What is Fanout?** A production-grade desktop application for AI Overview (AIO) research using DataForSEO APIs. It ingests mass keyword lists, recursively discovers related queries via fan-out, maps AI-cited sources to their exact page sections, and surfaces which domains dominate Google's AI answers.

---

## Documents

| # | File | Purpose |
|---|------|---------|
| 01 | [Project Overview](./01-project-overview.md) | What we're building, who it's for, core goals |
| 02 | [MVP Definition](./02-mvp.md) | Minimal viable product scope, feature checklist |
| 03 | [Roadmap](./03-roadmap.md) | Phased delivery plan, milestones |
| 04 | [Architecture](./04-architecture.md) | Technical decisions, stack rationale, schema |
| 05 | [Idea Inbox](./05-idea-inbox.md) | Unvetted feature ideas, experiments, backlog |
| 07 | [Debugging & Planning Guide](./07-debugging-planning.md) | AI-assisted dev workflow, prompt patterns |
| 08 | [Crawler Research](./08-crawler-research.md) | crawl4ai, Scrapling, and crawling strategy |
| 09 | [Customer Communication](./09-customer-comms.md) | How to talk to non-technical stakeholders |
| 10 | [Skills & Tools Registry](./10-skills-tools.md) | Claude Code skills, MCP servers, external tools |
| 11 | [GEO/AEO Tracker Research](./11-geo-aeo-research.md) | Competitive analysis of geo-aeo-tracker; feature gaps and improvement suggestions |

---

## Quick Status (as of March 2026)

```
Phase 1 (Foundation)        ████████████████████ 100%  ✅ Complete
Phase 2 (Core MVP)          ████████████████████ 100%  ✅ Complete
Phase 3 (Crawler)           ████████████████████ 100%  ✅ Complete
Phase 4 (Clustering)        ████████████████████ 100%  ✅ Complete
Post-P4 (UX/Analysis)       ████████████████████ 100%  ✅ Complete
Post-P4 (Organic Rankings)  ████████████████████ 100%  ✅ Complete
Phase 5 (Polish/iOS)        ░░░░░░░░░░░░░░░░░░░░   0%  🔲 Next
```

**Recent additions (Post-Phase 4 — Analysis & UX):**
- Scrapling tier-2 crawler: Python `StealthySession` sidecar on `localhost:11236`; spawned lazily, signals `scrapling-ready:` on stdout; three-tier crawl order: direct fetch → Scrapling → Firecrawl
- In-app Scrapling installer in SetupView: status badges, Check Status / Install Scrapling / Install Browsers buttons, live output display
- Topic keyword expand/collapse: `TopicRow` expands inline showing Keyword, Volume/mo, Intent, AIO Depth, AIO Count columns; data loaded lazily from existing DB
- Keywords view — AIO snippet brand filter: scans `aio_sources.aio_snippet` with LIKE; matching rows highlighted amber
- Keywords view — intent dropdown filter (All/informational/commercial/transactional/navigational)
- Keywords view — min volume filter (numeric input)
- Keywords view — featured snippet filter: `FS · No AIO` mode surfaces keywords with a featured snippet/answer box but no AI Overview — highest-probability AIO conversion targets; `FS`/`AB` badges on rows
- Column renames: "Depth" → "AIO Depth", "AIO Results" → "AIO Count" (both Keywords view and Topics expand)
- Report improvements: keywords & search volume table with Keyword/Volume/mo/Intent columns; HTML element explanation callout (context-specific text for h1/h2/h3/p/li/blockquote)
- Brief improvements: keywords + search volume table sorted by volume desc
- Competitive research: `docs/11-geo-aeo-research.md` — analysis of geo-aeo-tracker with 11 prioritised feature suggestions

**Recent additions (Post-Phase 4 — Organic Rankings):**
- `organic_rankings` table (schema v11 migration) — stores one row per organic SERP result per keyword
- Organic results extracted from DataForSEO `type: 'organic'` items using `rank_absolute` position (1–100)
- Domain chip `#` toggle in Keywords view — enables a green organic rank column beside the blue AIO column
- `getOrganicPositions` DB query — same partial-`LIKE` matching as AIO domain positions
- Keywords CSV export includes `aio_<domain>` + `organic_<domain>` columns for all selected domains
- `clearProjectData` FK-safe deletion includes `organic_rankings` first

**Earlier Post-Phase 4 additions:**
- Firecrawl credentials section in Setup (dedicated Save/Test/Clear UI; `firecrawlTestKey()` added to client)
- Crawler: removed `JS_ONLY_DOMAINS` fast-path — all URLs now try direct fetch first; Firecrawl is universal fallback
- Firecrawl cloud JS-render fallback in crawler (YouTube, social platforms, bot-blocked pages)
- Multi-domain comparison columns in Keywords view (N domains, parallel position queries)
- Live domain autocomplete suggestions (Google-style)
- Topics view: Keywords inline chips + Most Shown + Highest Ranking domain columns
- Singleton topics: all keywords appear in Topics regardless of cluster membership
- AIO Positions heatmap legend + relative score progress bar
- Clear Project Data (Danger Zone in Setup, FK-safe, preserves settings)
- Clear DataForSEO credentials button
- Column sorting on Keywords tab (click header, Excel-style)
- AIO Audit Tool rebrand + Tombo Group logo in sidebar
- Git repository initialised at github.com/jimhuangio/AIO-Audit-Tool

**Performance optimisations (March 2026):**
- DB: N+1 clustering query → single JOIN; `getTopics` correlated subqueries → CTE + window functions
- DB: `getProjectStats` / `getCrawlStats` each collapsed from 4 round-trips to 1 query
- DB: `NOT IN` → `LEFT JOIN` for uncrawled URL lookup; schema v3 adds 2 missing indexes
- Fanout: `getProjectMeta` cached once per run instead of once per keyword
- Crawler drain: O(n) `findIndex` → O(1) per-domain sub-queues with round-robin
- Clustering BFS: `queue.shift()` O(n) → head pointer O(1); similarity O(n²) → O(degree)
- Renderer: keyword polling only fires during active run; `domainPositionMaps` memo stabilised; large JSON blobs memoised; content-source totals memoised

**Next step:** Phase 5 — auto-updater + onboarding wizard + Windows CI build + dark mode.

---

## Key Architectural Decisions (TL;DR)

1. **Electron + React + TypeScript** — not Tauri, not Python; Node.js SQLite ecosystem wins
2. **`better-sqlite3`** — synchronous, embedded, zero install; one `.aio-project.db` per project
3. **DataForSEO direct HTTP** — `undici` fetch with `Authorization: Basic <base64>` — no MCP subprocess
4. **Firecrawl fallback** — cloud JS-render API for YouTube/social/bot-blocked pages; direct fetch always first
5. **Custom `SimpleQueue`** — in-process job queue with rate limiting + pause/resume; no external deps
6. **Global credentials store** — `userData/api-credentials.json`; project can override; never in `.db`; Clear button removes saved keys
7. **Zustand** — session-only global state; domain toggle (Root ↔ Subdomain) never persisted
8. **White professional UI** — Tailwind CSS, gray-50/white palette; all dark-mode classes removed
9. **All keywords in Topics** — singletons produce solo topics; no minimum cluster size enforced
10. **Query-per-run meta cache** — `getProjectMeta()` fetched once at run start, not per keyword
11. **CTE + window functions in getTopics** — pre-aggregates domain stats once instead of 4 correlated subqueries per topic row
12. **`organic_rankings` table (schema v11)** — one row per organic SERP result per keyword; `rank_absolute` as position; same domain-parsing helpers as `aio_sources`; CSV export always includes both AIO + organic columns
13. **Three-tier crawler** — direct `undici` fetch (Tier 1) → Scrapling Python sidecar (Tier 2) → Firecrawl cloud API (Tier 3); each tier attempted sequentially on failure
14. **Featured snippet detection** — SQLite LIKE scan on `serp_results.raw_json` for `"type":"featured_snippet"` / `"type":"answer_box"`; zero schema change; `FS · No AIO` filter = keywords with FS but no AIO citation

---

*Last updated: March 2026*
