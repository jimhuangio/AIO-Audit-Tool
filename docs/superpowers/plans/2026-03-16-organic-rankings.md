# Organic Rankings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract organic SERP positions from DataForSEO responses, store them in a new `organic_rankings` table, and surface them as toggleable columns on domain chips in the Keywords tab with CSV export support.

**Architecture:** A new `organic_rankings` table (v11 migration) stores one row per organic result per keyword; extraction runs in `worker.ts` after existing AIO/PAA extraction using shared domain-parsing helpers. The UI adds a `#` toggle button to each domain chip in KeywordsView, with a parallel `useQueries` + memo pattern to the existing AIO domain columns. Export sends `selectedDomains` to a new IPC handler that joins `organic_rankings` alongside the keyword rows.

**Tech Stack:** better-sqlite3 (sync SQLite), Electron IPC, React + TanStack Query, TypeScript, electron-vite

**Spec:** `docs/superpowers/specs/2026-03-16-organic-rankings-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/main/db/schema.ts` | Modify | Add `organic_rankings` to `CREATE_TABLES` AND to `MIGRATIONS[11]`; bump SCHEMA_VERSION |
| `src/main/db/index.ts` | Modify | Add `insertOrganicRankings`, `getOrganicPositions`; update `clearProjectData` |
| `src/main/fanout/extract.ts` | Modify | Add `extractOrganicResults` function |
| `src/main/fanout/worker.ts` | Modify | Call `extractOrganicResults` + `insertOrganicRankings` after AIO extraction |
| `src/main/ipc/handlers.ts` | Modify | Add `keywords:getOrganicPositions` handler; add `keywords:exportWithDomains` handler |
| `src/preload/index.ts` | Modify | Add `getOrganicPositionsForDomain` and `exportKeywordsCSV` entries |
| `src/renderer/src/views/KeywordsView.tsx` | Modify | Add `organicDomains` state, `#` toggle on chips, organic columns in table, export button |

---

## Chunk 1: Backend

### Task 1: Schema migration v11

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: Add `organic_rankings` to `CREATE_TABLES`**

  In `src/main/db/schema.ts`, add the table and index to the `CREATE_TABLES` string, after the `topic_keywords` block and before the closing backtick. Every table in `CREATE_TABLES` must also exist in `MIGRATIONS` and vice-versa — new projects use `CREATE_TABLES`, existing projects use `MIGRATIONS`.

  ```sql
  CREATE TABLE IF NOT EXISTS organic_rankings (
    id          INTEGER PRIMARY KEY,
    keyword_id  INTEGER NOT NULL REFERENCES keywords(id),
    domain_root TEXT    NOT NULL,
    domain_full TEXT    NOT NULL,
    position    INTEGER NOT NULL,
    url         TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_or_keyword_domain
    ON organic_rankings(keyword_id, domain_root);
  ```

- [ ] **Step 2: Bump SCHEMA_VERSION and add migration entry**

  Change line 4:
  ```ts
  export const SCHEMA_VERSION = 11
  ```

  Add to `MIGRATIONS` (after the `10:` entry):
  ```ts
  11: [
    `CREATE TABLE IF NOT EXISTS organic_rankings (
      id          INTEGER PRIMARY KEY,
      keyword_id  INTEGER NOT NULL REFERENCES keywords(id),
      domain_root TEXT    NOT NULL,
      domain_full TEXT    NOT NULL,
      position    INTEGER NOT NULL,
      url         TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_or_keyword_domain
       ON organic_rankings(keyword_id, domain_root)`
  ].join(';\n')
  ```

- [ ] **Step 3: Open a project in the app and verify migration runs without error**

  Launch the app, open an existing project. Check the dev console for any migration errors. The migration runner in `db/index.ts:54–76` splits on `;` and runs each statement — verify no crash.

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/db/schema.ts
  git commit -m "feat: add organic_rankings schema (CREATE_TABLES + migration v11)"
  ```

---

### Task 2: DB query functions

**Files:**
- Modify: `src/main/db/index.ts`

- [ ] **Step 1: Add `insertOrganicRankings` after `insertAIOSources`**

  Find the `insertAIOSources` function (~line 287) and add after it:

  ```ts
  export function insertOrganicRankings(
    keywordId: number,
    rankings: { domainRoot: string; domainFull: string; position: number; url: string }[]
  ): void {
    if (rankings.length === 0) return
    const db = getDB()
    const stmt = db.prepare(
      `INSERT INTO organic_rankings (keyword_id, domain_root, domain_full, position, url)
       VALUES (?, ?, ?, ?, ?)`
    )
    const tx = db.transaction(() => {
      for (const r of rankings) {
        stmt.run(keywordId, r.domainRoot, r.domainFull, r.position, r.url)
      }
    })
    tx()
  }
  ```

- [ ] **Step 2: Add `getOrganicPositions` after `getDomainPositions` (~line 244)**

  ```ts
  // Returns the organic position per keyword for a given domain (partial match).
  // Used to build per-domain organic rank columns in the keyword table.
  export function getOrganicPositions(domain: string): { keywordId: number; position: number }[] {
    const like = `%${domain}%`
    return getDB()
      .prepare(
        `SELECT keyword_id as keywordId, MIN(position) as position
         FROM organic_rankings
         WHERE domain_root LIKE ? OR domain_full LIKE ?
         GROUP BY keyword_id`
      )
      .all(like, like) as { keywordId: number; position: number }[]
  }
  ```

- [ ] **Step 3: Update `clearProjectData` to include `organic_rankings`**

  In `clearProjectData` (~line 773), add `DELETE FROM organic_rankings;` as the first line of the exec block. **This ordering is required**: `organic_rankings` has a foreign key reference to `keywords(id)`, and `PRAGMA foreign_keys=ON` is set — SQLite will reject deleting from `keywords` while `organic_rankings` still has referencing rows.

  ```ts
  export function clearProjectData(): void {
    getDB().exec(`
      DELETE FROM organic_rankings;
      DELETE FROM snippet_matches;
      DELETE FROM page_sections;
      DELETE FROM crawled_pages;
      DELETE FROM topic_keywords;
      DELETE FROM topics;
      DELETE FROM fanout_edges;
      DELETE FROM paa_questions;
      DELETE FROM aio_sources;
      DELETE FROM serp_results;
      DELETE FROM keywords;
    `)
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/db/index.ts
  git commit -m "feat: add insertOrganicRankings, getOrganicPositions, clear support"
  ```

---

### Task 3: Extraction + worker wiring

**Files:**
- Modify: `src/main/fanout/extract.ts`
- Modify: `src/main/fanout/worker.ts`

- [ ] **Step 1: Add `ExtractedOrganicResult` interface and `extractOrganicResults` to `extract.ts`**

  Add after the existing interfaces at the top of `extract.ts`:

  ```ts
  export interface ExtractedOrganicResult {
    domainRoot: string
    domainFull: string
    position: number
    url: string
  }
  ```

  Add the function after `extractSuggestedSearches`:

  ```ts
  // ─── Organic results extraction ───────────────────────────────────────────────

  export function extractOrganicResults(apiResponse: unknown): ExtractedOrganicResult[] {
    return getItems(apiResponse)
      .filter((i: any) => i?.type === 'organic' && i?.url)
      .map((i: any) => {
        const domainFull = parseDomainFull(i.url)
        return {
          domainFull,
          domainRoot: parseDomainRoot(domainFull),
          position: i.rank_absolute ?? i.position ?? 0,
          url: i.url
        }
      })
      .filter((r) => r.position > 0)
  }
  ```

  Note: DataForSEO organic items use `rank_absolute` for the true SERP position (1–100). `i.position` is a fallback in case the field differs.

- [ ] **Step 2: Wire extraction into `worker.ts`**

  In `worker.ts`, add `extractOrganicResults` to the import from `./extract`:

  ```ts
  import {
    extractAIOSources,
    extractPAAQuestions,
    extractSuggestedSearches,
    extractOrganicResults
  } from './extract'
  ```

  Add `insertOrganicRankings` to the import from `../db`:

  ```ts
  import {
    getKeyword,
    markKeywordRunning,
    markKeywordDone,
    markKeywordError,
    insertSerpResult,
    insertAIOSources,
    insertPAAQuestions,
    insertChildKeywords,
    getProjectMeta,
    insertOrganicRankings
  } from '../db'
  ```

  After the `insertAIOSources` block (~line 84), add:

  ```ts
  // Extract and store organic rankings
  const organicResults = extractOrganicResults(serpData)
  if (organicResults.length > 0) {
    insertOrganicRankings(keywordId, organicResults)
  }
  ```

- [ ] **Step 3: Manual smoke test**

  Run a keyword in the app. After it completes (status = done), open the project `.aio-project.db` file in a SQLite browser and run:
  ```sql
  SELECT * FROM organic_rankings LIMIT 10;
  ```
  Expect rows with `keyword_id`, `domain_root`, `domain_full`, `position` (1–100), `url`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/fanout/extract.ts src/main/fanout/worker.ts
  git commit -m "feat: extract and store organic SERP rankings per keyword"
  ```

---

### Task 4: IPC handlers and preload

**Files:**
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add import in `handlers.ts`**

  Add `getOrganicPositions` to the existing db import block near the top of `handlers.ts`:

  ```ts
  import {
    // ... existing imports ...
    getOrganicPositions
  } from '../db'
  ```

- [ ] **Step 2: Add `keywords:getOrganicPositions` handler**

  Find the keywords IPC section in `handlers.ts` (near the `keywords:getDomainPositions` handler) and add:

  ```ts
  ipcMain.handle('keywords:getOrganicPositions', (_e, domain: string) => {
    return getOrganicPositions(domain)
  })
  ```

- [ ] **Step 3: Add `keywords:exportWithDomains` handler**

  This handler builds a CSV of all keywords + AIO positions + organic positions for all selected domains. Add after the `export:csv` handler block:

  ```ts
  ipcMain.handle('keywords:exportWithDomains', async (_e, domains: string[]) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Keywords CSV',
      defaultPath: `fanout-keywords-${Date.now()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!filePath) return null

    const keywords = getKeywordRows(Number.MAX_SAFE_INTEGER, 0)  // no cap — export all
    if (keywords.length === 0) return null

    // Build domain position maps
    const aioDomainMaps: Record<string, Record<number, number>> = {}
    const organicDomainMaps: Record<string, Record<number, number>> = {}
    for (const domain of domains) {
      const aioRows = getDomainPositions(domain)
      aioDomainMaps[domain] = Object.fromEntries(aioRows.map(r => [r.keywordId, r.position]))
      const organicRows = getOrganicPositions(domain)
      organicDomainMaps[domain] = Object.fromEntries(organicRows.map(r => [r.keywordId, r.position]))
    }

    // Build headers
    const baseHeaders = ['id', 'keyword', 'status', 'search_volume', 'search_intent', 'depth']
    const domainHeaders = domains.flatMap(d => [`aio_${d}`, `organic_${d}`])
    const headers = [...baseHeaders, ...domainHeaders]

    // Build rows
    const rows = keywords.map(kw => {
      const base = [kw.id, `"${kw.keyword.replace(/"/g, '""')}"`, kw.status, kw.searchVolume ?? '', kw.searchIntent ?? '', kw.depth]
      const domainCols = domains.flatMap(d => [
        aioDomainMaps[d]?.[kw.id] ?? '',
        organicDomainMaps[d]?.[kw.id] ?? ''
      ])
      return [...base, ...domainCols].join(',')
    })

    writeFileSync(filePath, [headers.join(','), ...rows].join('\n'), 'utf-8')
    return filePath
  })
  ```

  Also add `getDomainPositions` and `getKeywordRows` to the db import if not already present (check the existing imports).

- [ ] **Step 4: Add entries to `preload/index.ts`**

  In the `// ─── Keywords ───` section of `preload/index.ts`, add:

  ```ts
  getOrganicPositionsForDomain: (domain: string): Promise<{ keywordId: number; position: number }[]> =>
    ipcRenderer.invoke('keywords:getOrganicPositions', domain),

  exportKeywordsCSV: (domains: string[]): Promise<string | null> =>
    ipcRenderer.invoke('keywords:exportWithDomains', domains),
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/main/ipc/handlers.ts src/preload/index.ts
  git commit -m "feat: add IPC handlers for organic positions and keywords CSV export"
  ```

---

## Chunk 2: Frontend

### Task 5: Domain chip toggle and organic columns

**Files:**
- Modify: `src/renderer/src/views/KeywordsView.tsx`

- [ ] **Step 1: Update React import to include default import**

  Line 1 of `KeywordsView.tsx` currently reads:
  ```ts
  import { useState, useRef, useMemo } from 'react'
  ```

  Change to:
  ```ts
  import React, { useState, useRef, useMemo } from 'react'
  ```

  This is required because Steps 6 and 7 use `React.Fragment` with a `key` prop. The shorthand `<>` fragment syntax does not accept `key`.

- [ ] **Step 2: Add `organicDomains` state**

  Find the `selectedDomains` state declaration (~line 44) and add directly below it:

  ```ts
  const [organicDomains, setOrganicDomains] = useState<string[]>([])
  ```

- [ ] **Step 3: Add organic useQueries block**

  Find the existing domain position `useQueries` block (~line 68) and add a parallel block after it:

  ```ts
  // One organic position query per domain with organic toggle enabled
  const organicPositionResults = useQueries({
    queries: organicDomains.map((domain) => ({
      queryKey: ['keywords', 'organicPositions', domain],
      queryFn: () => window.api.getOrganicPositionsForDomain(domain),
      enabled: !!project
    }))
  })
  ```

- [ ] **Step 4: Add `organicPositionMaps` memo**

  Find the `domainPositionMaps` useMemo (~line 81) and add after it:

  ```ts
  const organicDataKey = organicPositionResults.map(r => r.dataUpdatedAt).join(',')
  const organicPositionMaps = useMemo(() => {
    const maps: Record<string, Record<number, number>> = {}
    organicDomains.forEach((domain, i) => {
      const data = organicPositionResults[i]?.data ?? []
      const map: Record<number, number> = {}
      data.forEach(({ keywordId, position }) => { map[keywordId] = position })
      maps[domain] = map
    })
    return maps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organicDomains, organicDataKey])
  ```

- [ ] **Step 5: Add `toggleOrganicDomain` helper**

  Find the `addDomain` / `removeDomain` functions (~line 145) and add:

  ```ts
  function toggleOrganicDomain(domain: string): void {
    setOrganicDomains(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    )
  }
  ```

  Also update `removeDomain` to clean up organic state when a chip is removed:

  ```ts
  function removeDomain(domain: string): void {
    setSelectedDomains(prev => prev.filter(d => d !== domain))
    setOrganicDomains(prev => prev.filter(d => d !== domain))
  }
  ```

- [ ] **Step 6: Add `#` toggle button to each domain chip**

  Find the domain chip rendering block (~line 282):

  ```tsx
  {selectedDomains.map((domain) => (
    <span
      key={domain}
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 font-mono"
    >
      {domain}
      <button
        onClick={() => removeDomain(domain)}
        className="text-blue-400 hover:text-blue-700 transition-colors ml-0.5"
      >
        ✕
      </button>
    </span>
  ))}
  ```

  Replace with:

  ```tsx
  {selectedDomains.map((domain) => {
    const hasOrganic = organicDomains.includes(domain)
    return (
      <span
        key={domain}
        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 font-mono"
      >
        {domain}
        <button
          onClick={() => toggleOrganicDomain(domain)}
          title={hasOrganic ? 'Hide organic rank column' : 'Show organic rank column'}
          className={`transition-colors ml-0.5 px-0.5 rounded ${
            hasOrganic
              ? 'text-white bg-blue-600 hover:bg-blue-700'
              : 'text-blue-300 hover:text-blue-600'
          }`}
        >
          #
        </button>
        <button
          onClick={() => removeDomain(domain)}
          className="text-blue-400 hover:text-blue-700 transition-colors"
        >
          ✕
        </button>
      </span>
    )
  })}
  ```

- [ ] **Step 7: Replace domain column headers with interleaved AIO + organic per domain**

  The spec requires organic columns to appear immediately after their paired AIO column. Replace the existing `selectedDomains.map(...)` header block (~line 356) with a single block that renders both AIO and (conditionally) organic for each domain:

  ```tsx
  {selectedDomains.map((domain) => (
    <React.Fragment key={domain}>
      <th
        onClick={() => handleSort(domain)}
        className="px-3 py-2 text-right text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap font-mono"
      >
        {domain}<SortIcon sortKey={sortKey} col={domain} sortDir={sortDir} />
      </th>
      {organicDomains.includes(domain) && (
        <th
          key={`organic_${domain}`}
          onClick={() => handleSort(`organic_${domain}`)}
          className="px-3 py-2 text-right text-xs font-medium text-green-700 sticky top-0 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap font-mono"
        >
          <span className="flex items-center justify-end gap-1">
            {domain} <span className="text-green-500">#</span>
            <SortIcon sortKey={sortKey} col={`organic_${domain}`} sortDir={sortDir} />
          </span>
        </th>
      )}
    </React.Fragment>
  ))}
  ```

  `React.Fragment` (with explicit `key`) is needed here because shorthand `<>` doesn't accept `key` props. The file imports React as named only (`import { useState, useRef, useMemo } from 'react'`). Add a default import to make `React.Fragment` available:

  ```ts
  import React, { useState, useRef, useMemo } from 'react'
  ```

- [ ] **Step 8: Replace domain column cells with interleaved AIO + organic per domain**

  Similarly, replace the existing `selectedDomains.map(...)` cell block (~line 425) so each domain's organic cell immediately follows its AIO cell:

  ```tsx
  {selectedDomains.map((domain) => {
    const aioPos = domainPositionMaps[domain]?.[kw.id]
    const orgPos = organicPositionMaps[domain]?.[kw.id]
    return (
      <React.Fragment key={domain}>
        <td className="px-3 py-1.5 text-xs text-right tabular-nums">
          {aioPos != null ? (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">
              {aioPos}
            </span>
          ) : (
            <span className="text-gray-200">—</span>
          )}
        </td>
        {organicDomains.includes(domain) && (
          <td className="px-3 py-1.5 text-xs text-right tabular-nums">
            {orgPos != null ? (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-green-600 text-white text-xs font-bold">
                {orgPos}
              </span>
            ) : null}
          </td>
        )}
      </React.Fragment>
    )
  })}
  ```

  Note: blank (null) when not organically ranking — matches spec. AIO uses `—` for empty; organic uses blank per user decision.

- [ ] **Step 9: Update sort handling to support organic columns**

  The `filtered` useMemo in `KeywordsView.tsx` (~line 102) has a sort comparator that falls through to an `else` branch for domain columns. Replace the final `else` block:

  ```ts
  // BEFORE (existing):
  } else {
    // domain column — lower position is better; missing = treat as 99
    valA = domainPositionMaps[sortKey]?.[a.id] ?? 99
    valB = domainPositionMaps[sortKey]?.[b.id] ?? 99
  }
  ```

  Replace with:

  ```ts
  // AFTER:
  } else if (sortKey.startsWith('organic_')) {
    const domain = sortKey.slice('organic_'.length)
    valA = organicPositionMaps[domain]?.[a.id] ?? Infinity
    valB = organicPositionMaps[domain]?.[b.id] ?? Infinity
  } else {
    // AIO domain column — lower position is better; missing = treat as 99
    valA = domainPositionMaps[sortKey]?.[a.id] ?? 99
    valB = domainPositionMaps[sortKey]?.[b.id] ?? 99
  }
  ```

  Note: variable names are `valA`/`valB` (matching the existing declarations at ~line 103). Also add `organicPositionMaps` to the `filtered` useMemo dependency array at ~line 134:

  ```ts
  }, [keywords, filterStatus, filterText, sortKey, sortDir, domainPositionMaps, organicPositionMaps])
  ```

- [ ] **Step 10: Commit**

  ```bash
  git add src/renderer/src/views/KeywordsView.tsx
  git commit -m "feat: add organic rank toggle on domain chips with green rank columns"
  ```

---

### Task 6: Export button

**Files:**
- Modify: `src/renderer/src/views/KeywordsView.tsx`

- [ ] **Step 1: Add export button to the toolbar**

  Find where other action buttons live in the KeywordsView toolbar (look for the CSV upload button or the keyword insert area). Add an export button that is only enabled when `selectedDomains.length > 0`:

  ```tsx
  <button
    onClick={async () => {
      await window.api.exportKeywordsCSV(selectedDomains)
    }}
    disabled={selectedDomains.length === 0}
    className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
  >
    Export CSV
  </button>
  ```

  The export always includes organic data for all `selectedDomains` regardless of which organic toggles are on — this matches the spec.

- [ ] **Step 2: Verify export output**

  With at least one domain chip added and some processed keywords, click Export CSV. Open the resulting file and verify:
  - Columns: `id,keyword,status,search_volume,search_intent,depth,aio_example.com,organic_example.com,...`
  - `aio_*` values are AIO positions (1–10 typically, or blank)
  - `organic_*` values are organic positions (1–100 or blank)
  - Keywords with no data have blank cells, not zeros or dashes

- [ ] **Step 3: Commit**

  ```bash
  git add src/renderer/src/views/KeywordsView.tsx
  git commit -m "feat: add keywords CSV export with AIO and organic domain columns"
  ```

---

## Verification

- [ ] Run a fresh keyword — check `organic_rankings` table has rows with correct `rank_absolute`-based positions
- [ ] Add a domain chip → organic toggle shows, `#` button highlights when active
- [ ] Organic column appears in green, AIO column in blue — visually distinct
- [ ] Removing a chip removes both AIO and organic columns
- [ ] Clear project data — verify `organic_rankings` is empty afterwards
- [ ] Export with 2 domains — CSV has `aio_domain1`, `organic_domain1`, `aio_domain2`, `organic_domain2` columns
