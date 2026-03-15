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
| 06 | [iOS Transition Guide](./06-ios-transition.md) | Path from Electron desktop → iOS app |
| 07 | [Debugging & Planning Guide](./07-debugging-planning.md) | AI-assisted dev workflow, prompt patterns |
| 08 | [Crawler Research](./08-crawler-research.md) | crawl4ai, Scrapling, and crawling strategy |
| 09 | [Customer Communication](./09-customer-comms.md) | How to talk to non-technical stakeholders |
| 10 | [Skills & Tools Registry](./10-skills-tools.md) | Claude Code skills, MCP servers, external tools |

---

## Quick Status (as of March 2026)

```
Phase 1 (Foundation)    ████████████████████ 100%  ✅ Complete
Phase 2 (Core MVP)      ████████████████████ 100%  ✅ Complete
Phase 3 (Crawler)       ████████████████████ 100%  ✅ Complete
Phase 4 (Clustering)    ████████████████████ 100%  ✅ Complete
Post-P4 (UX/Analysis)   ████████████████████ 100%  ✅ Complete
Phase 5 (Polish/iOS)    ░░░░░░░░░░░░░░░░░░░░   0%  🔲 Next
```

**Recent additions (Post-Phase 4):**
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

**Next step:** Phase 5 — auto-updater + onboarding wizard + Windows CI build.

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

---

*Last updated: March 2026*
