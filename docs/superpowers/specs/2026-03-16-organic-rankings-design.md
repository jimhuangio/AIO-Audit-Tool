# Organic Rankings Feature Design

**Date:** 2026-03-16
**Status:** Approved

## Overview

Add organic search ranking data to the Keywords tab. DataForSEO already returns `type: 'organic'` items in SERP responses — these are stored in `serp_results.raw_json` but never extracted. This feature extracts them into a queryable table, surfaces them as toggleable columns on domain chips in KeywordsView, and includes them in CSV exports.

## Data Layer

### New Table: `organic_rankings`

```sql
CREATE TABLE organic_rankings (
  id          INTEGER PRIMARY KEY,
  keyword_id  INTEGER NOT NULL REFERENCES keywords(id),
  domain_root TEXT    NOT NULL,
  domain_full TEXT    NOT NULL,
  position    INTEGER NOT NULL,
  url         TEXT    NOT NULL
);
CREATE INDEX organic_rankings_keyword_domain
  ON organic_rankings(keyword_id, domain_root);
```

- Stores one row per organic result per keyword (DataForSEO returns up to 100 per keyword via `depth: 100`).
- `domain_root` and `domain_full` are populated using the existing `parseDomainFull` and `parseDomainRoot` helpers from `src/main/fanout/extract.ts` — same normalization as `aio_sources`.
- Added as schema migration v11 in `db/schema.ts`.

### DataForSEO Field Mapping

DataForSEO `type: 'organic'` items contain both `rank_absolute` (1-based position in the full result set) and `position` (rank within an item's group). The stored `position` column uses `item.rank_absolute`, which is the true SERP rank (e.g. 1–100).

### Extraction

In `worker.ts`, after existing AIO/PAA extraction, iterate `type: 'organic'` items from the parsed SERP response and bulk-insert into `organic_rankings`.

- **Forward-only** — no backfill of historical `serp_results.raw_json`.
- For each item: call `parseDomainFull(item.url)` for `domain_full`, then `parseDomainRoot(domain_full)` for `domain_root`, store `rank_absolute` as `position` and `item.url`.
- All organic positions stored regardless of rank (not capped at top 10).
- If no `type: 'organic'` items exist in the response, extraction is a no-op.

### New DB Query

```ts
getOrganicPositions(domain: string): { keywordId: number; position: number }[]
```

Uses the same partial `LIKE` matching as the existing `getDomainPositions`:
```sql
SELECT keyword_id, position
FROM organic_rankings
WHERE domain_root LIKE ? OR domain_full LIKE ?
```
with `%domain%` as the bind value — consistent with how domain chips (populated from `getDomainSuggestions` which returns `domain_root` values) query `aio_sources`.

### Data Reset

`clearProjectData()` in `db/index.ts` must include `DELETE FROM organic_rankings` alongside the other table deletions to avoid orphaned records after a project data clear.

## IPC Bridge

- New handler: `ipcMain.handle('keywords:getOrganicPositions', (_, domain) => getOrganicPositions(domain))`
- New preload entry: `getOrganicPositionsForDomain: (domain: string) => ipcRenderer.invoke('keywords:getOrganicPositions', domain)`

## UI — KeywordsView

### Domain Chip Toggle

Each existing domain chip gains a small `#` icon button that toggles organic ranking display for that domain.

- The organic toggle is **only available on existing domain chips** — a domain must already be in `selectedDomains` to have an organic column.
- New state: `organicDomains: string[]` — tracks which domains have organic column enabled (parallel to `selectedDomains: string[]`).
- Toggling adds/removes the domain from `organicDomains` (filter/concat, not Set mutation).
- A domain can independently have: AIO column, organic column, both, or neither.

### Organic Position Data

- New `useQueries` block fetching `getOrganicPositionsForDomain` for each domain in `organicDomains`.
- New `organicPositionMaps: Map<string, Map<number, number>>` memo — `domain → keywordId → position`.
- Column display: blank cell if domain not in organic results for that keyword; actual position number if present at any rank.
- Column header distinguishes from AIO columns: e.g. `example.com` for AIO, `example.com #` for organic.

### Column Ordering

Organic rank column for a domain appears immediately after its AIO column when both are present. If only organic (AIO column not added), it appears in the order the domain chip was added.

## Export (CSV)

The existing `export:csv` IPC handler is extended: when exporting the keywords table, the renderer passes the current `selectedDomains` array as an additional parameter. The main-process handler queries `organic_rankings` for those domains and adds an `organic_[domain]` column alongside the existing `aio_[domain]` column for each.

- Includes organic data for **every domain in `selectedDomains`**, regardless of whether the organic toggle is on in the UI.
- If no organic data exists for a domain+keyword pair, the cell is empty.
- IPC signature change: `export:csv` gains an optional third parameter `domains: string[]`.

## Out of Scope

- Backfill from historical `serp_results.raw_json`.
- Trend tracking / position change over time.
- Organic results for domains not in `selectedDomains`.
