# Debugging & Planning Guide — Fanout SEO

> How to use AI tools effectively for this project, how to debug using the feature checklist, and how to plan new features without going off-rails.

---

## Core Development Principles

### 1. Only Modify What Was Asked

> "When making changes, ONLY modify the specific function/component requested. Output ONLY the changed section with clear markers showing where it belongs. Do not rewrite unrelated code."

**In practice:**
- Reference specific file + function + line range in every AI prompt
- Example: "In `src/main/fanout/worker.ts`, function `processSerpJob` (lines 45–82), update only the retry logic to use exponential backoff with a max delay of 30 seconds"
- Never: "Fix the job queue" (too broad — will cause rewrites)

### 2. Use Chat for Design, Build for Code

| Mode | Use For |
|------|---------|
| **Chat (Claude Code)** | Architecture decisions, algorithm design, debugging logic, reviewing approaches |
| **Specific build prompts** | Targeted code changes to named functions/lines |

**Pattern:**
1. Chat: "Walk me through how the fan-out deduplication should handle a keyword discovered at both depth 1 and depth 2"
2. Once aligned: "In `src/main/fanout/scheduler.ts`, function `insertChildKeywords` (lines 78–105), implement the deduplication so that existing keywords at any depth are not re-enqueued but their fanout_edges row is still created"

### 3. Modular Component Structure

Each file in this project has a single responsibility:

```
src/main/
├── db/schema.ts           → ONLY schema DDL
├── db/queries/aio.ts      → ONLY AIO report queries
├── fanout/worker.ts       → ONLY BullMQ worker logic
├── fanout/scheduler.ts    → ONLY enqueue + dedupe
├── crawler/index.ts       → ONLY HTTP fetch + store
├── crawler/snippet.ts     → ONLY matching algorithm
└── mcp-client.ts          → ONLY MCP connection

src/renderer/
├── store/app-store.ts     → ONLY Zustand state
├── views/AIOPositionsView.tsx → ONLY position heatmap
└── components/DomainToggle.tsx → ONLY the toggle widget
```

**Rule:** If a PR touches more than 2 files, question whether the scope is too large.

---

## Debugging with the Feature Checklist

### Checklist-Driven Debug Process

When something breaks, use the checklist in `02-mvp.md` to locate the failure layer:

```
1. Is the issue in the UI layer?
   → Check: renderer views, Zustand state, TanStack Query keys

2. Is the issue in the IPC layer?
   → Check: contextBridge types, ipcMain handler registration

3. Is the issue in the DB layer?
   → Check: SQL query, index usage (EXPLAIN QUERY PLAN), schema migration ran

4. Is the issue in the MCP/API layer?
   → Check: raw JSON in serp_results table (it's always stored first)
   → Re-run extraction logic against stored JSON without re-fetching

5. Is the issue in the queue layer?
   → Check: BullMQ job state (failed/stalled), error_msg in keywords table
```

### Debug Query Toolkit

```sql
-- Where is the queue stuck?
SELECT status, COUNT(*) FROM keywords GROUP BY status;

-- What errors occurred?
SELECT keyword, error_msg, done_at FROM keywords WHERE status='error' LIMIT 20;

-- Are AIO sources being extracted?
SELECT k.keyword, COUNT(a.id) as source_count
FROM keywords k
LEFT JOIN aio_sources a ON a.keyword_id = k.id
WHERE k.status = 'done'
GROUP BY k.id
HAVING source_count = 0
LIMIT 20;

-- Check raw JSON for a specific keyword (inspect API response)
SELECT r.result_type, r.raw_json
FROM serp_results r
JOIN keywords k ON r.keyword_id = k.id
WHERE k.keyword = 'best credit cards'
LIMIT 3;

-- Verify domain parsing
SELECT url, domain_root, domain_full FROM aio_sources LIMIT 20;

-- AIO position report sanity check
SELECT position, COUNT(DISTINCT keyword_id) as kw_count, COUNT(*) as total
FROM aio_sources
GROUP BY position
ORDER BY position;
```

### Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Keywords stuck in `queued` | BullMQ worker not started / crashed | Check main process logs; restart worker |
| `aio_sources` empty for done keywords | AIO not present in SERP OR extraction bug | Check raw JSON in `serp_results`; look for `ai_overview` type in items array |
| domain_root showing full subdomain | URL parsing edge case | Test with `new URL(url).hostname.split('.').slice(-2).join('.')` for the specific URL |
| Toggle doesn't update table | TanStack Query key not including domainMode | Verify `queryKey: ["aio-positions", domainMode]` |
| Fan-out not stopping at depth | depth comparison off-by-one | `depth < maxDepth` not `depth <= maxDepth` |
| Duplicate keywords inserted | UNIQUE constraint missing or wrong | Check schema; `keyword` column must have `UNIQUE` |

---

## Planning New Features

### Feature Planning Template

Before implementing any idea from the inbox (`05-idea-inbox.md`), fill this out:

```
Feature: [name]
Checklist Item: Which MVP checklist item does this relate to?
Schema Changes: [new tables/columns needed, or "none"]
IPC Changes: [new API methods, or "none"]
Component: [which view/component changes]
Risk: [what could break, what to test first]
Acceptance Criteria:
  - [ ] Given [input], when [action], then [result]
  - [ ] Given [input], when [action], then [result]
```

### Feature Integration Process

1. **Start with schema** — if the feature needs new data, design the table first
2. **Write the query** — prove the SQL works before building UI
3. **Add IPC handler** — add to `window.api` interface
4. **Build the component** — use the IPC method
5. **Test with real data** — load a project DB with actual harvested data

### Diff Review Workflow

Before merging any AI-generated code:

```bash
# Review only changed functions, not whole files
git diff --unified=5 src/main/fanout/worker.ts

# Check that no unrelated functions changed
git diff --stat

# Verify no new dependencies were silently added
git diff package.json
```

**Red flags in AI-generated code:**
- New imports that weren't in the spec
- Functions renamed or signatures changed without being asked
- New error handling that swallows exceptions silently
- Added `console.log` statements left in production paths

---

## Prompt Patterns That Work

### Pattern 1: Targeted Function Edit

```
File: src/main/db/queries/aio.ts
Function: getAIOPositionReport (lines 12–35)
Change: Add a HAVING clause to filter out domains with fewer than N appearances
        where N is a new parameter `minAppearances: number` defaulting to 1
Do NOT change: getAIODomainPivot, getAIVisibilityScore, or any other function
```

### Pattern 2: New Function in Existing Module

```
File: src/main/db/queries/aio.ts
Add after line 60: A new exported function `getTopDomainsForKeyword`
Signature: (db: Database, keywordId: number, useSubdomain: boolean) => AIOSourceRow[]
Purpose: Return all AIO sources for a single keyword, ordered by position ASC
Do NOT modify existing functions.
```

### Pattern 3: SQL Query Review

```
Review this SQL query for correctness and index usage.
Schema context: [paste relevant CREATE TABLE + CREATE INDEX]
Query: [paste query]
Check:
  1. Will it use the idx_as_domain_r index?
  2. Is the ROUND() on the right column?
  3. Any edge case with zero keywords?
Return: ONLY the corrected query + explanation of changes, nothing else.
```

### Pattern 4: Bug Isolation

```
Bug: AIO sources for keyword ID 42 show domain_root='support.google.com' instead of 'google.com'
File: src/main/fanout/worker.ts
Function: extractAIOSources (lines 88–110)
Specific line: The domain_root calculation
Input that fails: url = "https://support.google.com/chrome/answer/123456"
Expected domain_root: "google.com"
Actual domain_root: "support.google.com"
Fix ONLY the domain_root extraction logic.
```

---

## Iteration Rhythm

```
Week cadence (suggested):
  Monday    → Review idea inbox, promote 1–2 items to roadmap
  Tue–Thu   → Implementation sprints (small, targeted PRs)
  Friday    → Debug session using checklist + debug queries
              Update checklist status in 02-mvp.md
              Write any new ideas discovered this week to 05-idea-inbox.md
```

---

*← [iOS Transition](./06-ios-transition.md) | Next: [Crawler Research](./08-crawler-research.md) →*
