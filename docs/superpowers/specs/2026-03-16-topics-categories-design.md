# Topics Category Hierarchy Design

**Date:** 2026-03-16
**Status:** Approved

## Overview

Add a two-level category hierarchy (main category → sub-category → topics) to the Topics view. Gemini automatically proposes the hierarchy after every clustering run. Users can rename categories and rearrange topics and sub-categories via drag-and-drop or right-click context menu. Brief and HTML Report buttons are available at every level.

---

## Data Model

### New Tables (schema migration v12)

```sql
CREATE TABLE main_categories (
  id       INTEGER PRIMARY KEY,
  label    TEXT    NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sub_categories (
  id               INTEGER PRIMARY KEY,
  main_category_id INTEGER NOT NULL REFERENCES main_categories(id),
  label            TEXT    NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0
);
```

### Modified Table

```sql
ALTER TABLE topics ADD COLUMN sub_category_id INTEGER REFERENCES sub_categories(id);
```

- `position` on both tables drives display order; updated in batch after every drag-and-drop.
- Topics with `sub_category_id = NULL` are uncategorised — shown in a collapsible "Uncategorised" bucket at the bottom.
- `clearProjectData()` and `clearTopics()` include FK-safe deletions:
  1. `UPDATE topics SET sub_category_id = NULL`
  2. `DELETE FROM sub_categories`
  3. `DELETE FROM main_categories`

---

## Categorisation Engine

**File:** `src/main/topics/categorize.ts` (new)

### `categorizeTopics(topics, apiKey)`

Called automatically from `topics/run.ts` immediately after `runClustering()` completes. No manual trigger.

**Steps:**
1. Takes freshly-written topic labels — no extra DB read.
2. POSTs to `gemini-2.5-pro` via Generative Language REST API with JSON schema response (same pattern as `clusterWithGemini()`).

**Prompt:**
```
Group these N topic labels into a two-level hierarchy.
Return main categories with sub-categories under each.
Every topic must appear exactly once.
```

**Response schema:**
```json
{
  "mainCategories": [
    {
      "label": "string",
      "subCategories": [
        {
          "label": "string",
          "topicLabels": ["string"]
        }
      ]
    }
  ]
}
```

3. Maps `topicLabels` strings back to topic IDs via case-insensitive lookup.
4. Calls `clearAndInsertCategories(hierarchy)` — single transaction.

**Fallback:** If Gemini key is absent or call fails, all topics remain with `sub_category_id = NULL`. The Uncategorised bucket catches them. No crash, no partial state.

### `clearAndInsertCategories(hierarchy)` in `db/index.ts`

Runs in one transaction:
1. `UPDATE topics SET sub_category_id = NULL`
2. `DELETE FROM sub_categories`
3. `DELETE FROM main_categories`
4. `INSERT main_categories` with positions
5. `INSERT sub_categories` with positions and `main_category_id`
6. `UPDATE topics SET sub_category_id = ...` for each topic mapping

---

## DB Queries

All new functions added to `src/main/db/index.ts`.

| Function | Description |
|---|---|
| `getFullHierarchy()` | Single query returning all main cats → sub cats → topics with full `TopicRow` stats. Uncategorised topics appended at end. |
| `updateTopicCategory(topicId, subCategoryId)` | Move topic to a different sub-category (drag-and-drop) |
| `moveSubCategory(subCategoryId, mainCategoryId)` | Move sub-category to a different main category |
| `renameMainCategory(id, label)` | Inline label edit |
| `renameSubCategory(id, label)` | Inline label edit |
| `reorderCategories(updates: {id, level, position}[])` | Batch position update after drag completes |

`getFullHierarchy()` returns everything the UI needs in one round trip, avoiding N+1 queries per category level.

---

## IPC API

New channel prefix: `categories:*`. All handlers added to `src/main/ipc/handlers.ts`.

| Channel | Payload | Purpose |
|---|---|---|
| `categories:getHierarchy` | — | Initial load and after recluster |
| `categories:updateTopicCategory` | `topicId, subCategoryId` | Drop topic onto sub-category |
| `categories:moveSubCategory` | `subCategoryId, mainCategoryId` | Drop sub-category onto main category |
| `categories:renameMain` | `id, label` | Save inline edit |
| `categories:renameSub` | `id, label` | Save inline edit |
| `categories:reorder` | `{ id, level, position }[]` | Batch reorder after drag |
| `report:generateForMain` | `mainCategoryId` | Scoped HTML report |
| `report:generateForSub` | `subCategoryId` | Scoped HTML report |

`report:generateForMain` and `report:generateForSub` reuse the existing `buildReportHTML()` builder with a filtered topic list (topics whose `sub_category_id` belongs to the requested category).

New preload entries added to `src/preload/index.ts` for each channel above.

---

## Report Generation

`buildReportHTML()` in `src/main/report/builder.ts` already accepts a `topics[]` array. Category-scoped reports pass only the topics belonging to that category:

- **Sub-category report:** topics where `sub_category_id = subCategoryId`
- **Main category report:** topics where `sub_category_id IN (SELECT id FROM sub_categories WHERE main_category_id = mainCategoryId)`
- **Full project report:** unchanged — all topics (existing toolbar button)

Report filename pattern: `<CategoryLabel>_AIO_Report.html`

---

## UI

### Layout

Grouped table with two-level collapsible header rows (designed and approved in visual mockups):

| Level | Row style | Columns |
|---|---|---|
| Main category | Dark navy header (`#1e3a5f`, white text) | Label + keyword count, Est. Traffic, Most Shown, Highest Rank, Brief, Report |
| Sub-category | Blue band (`#dbeafe`, blue text), indented 12px | Same columns |
| Topic | White row, indented 28px | Label, Est. Traffic, Keywords, Most Shown, Highest Rank, Brief, — |
| Uncategorised | Dark gray header, no Report button | Same as main category but grayed |

Topic rows have **Brief** only (no Report). Category rows have **Brief** and **Report** as separate columns. Full Project Report lives in the toolbar.

### New Files

| File | Action |
|---|---|
| `src/renderer/src/components/CategoryRow.tsx` | Main category header row — collapse toggle, rename, drag target, Brief + Report |
| `src/renderer/src/components/SubCategoryRow.tsx` | Sub-category header row — same but blue band style |
| `src/renderer/src/components/TopicRow.tsx` | Individual topic row — extracted from current TopicsView inline JSX |
| `src/renderer/src/views/TopicsView.tsx` | Modified — swaps flat `TopicRow[]` for hierarchy data; renders category groups |

### Drag and Drop

HTML5 native drag API — no external library.

- `draggable="true"` on topic rows and sub-category header rows.
- `onDragStart` stores `{ type: 'topic' | 'subcategory', id }` in `event.dataTransfer`.
- `onDragOver` / `onDrop` on category header rows highlight valid targets and fire the appropriate IPC call on drop.
- `onDragEnd` fires `categories:reorder` with updated `position` values.

**Valid drop targets:**
- Topic → any sub-category header
- Sub-category → any main category header

### Right-Click Context Menu

A single floating `<div>` rendered at the root of `TopicsView`, positioned via `{ x, y }` state. Shown on `onContextMenu`, dismissed on click-away or Escape.

**Menu items (topic row):**
- Rename
- Move to… → submenu listing all sub-categories
- Move to new sub-category… → creates sub-category, enters rename mode

**Menu items (sub-category row):**
- Rename
- Move to… → submenu listing all main categories
- Move to new main category… → creates main category, enters rename mode

**Menu items (main category row):**
- Rename

### Inline Rename

Identical to today's topic label editing: click label text → `<input>` appears pre-filled → Enter saves via `categories:renameMain` or `categories:renameSub`, Escape cancels.

### Uncategorised Bucket

- Collapsible, dark gray header row
- No Report button (no category scope)
- Topics inside still have Brief buttons
- Disappears once all topics have a `sub_category_id`
- Shows during Gemini processing delay or if Gemini key is absent

### State Refresh

`onTopicsUpdated` already fires after every auto-recluster. Extend its handler in TopicsView to also invalidate `['categories', 'hierarchy']` so the grouped view rebuilds automatically:

```typescript
queryClient.invalidateQueries({ queryKey: ['topics'] })
queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
```

---

## Out of Scope

- Manually creating categories from scratch (Gemini always seeds the hierarchy; users reshape it)
- More than two levels of nesting
- Per-category keyword filtering or search
- Persisting collapse/expand state across sessions
