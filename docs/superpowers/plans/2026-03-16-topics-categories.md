# Topics Category Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gemini-generated two-level category hierarchy (main category → sub-category → topics) to the Topics view, with Brief and HTML Report at every level, drag-and-drop rearranging, and right-click context menus.

**Architecture:** Two new DB tables (`main_categories`, `sub_categories`) plus a nullable FK on `topics.sub_category_id`. A new `categorize.ts` engine calls `gemini-2.5-pro` after every clustering run and writes the hierarchy in one transaction. The renderer receives a nested `CategoryHierarchy` object over IPC and renders it as a grouped collapsible table with three extracted components.

**Tech Stack:** better-sqlite3 (sync SQLite), Electron IPC, React + TanStack Query, TypeScript, Tailwind CSS, HTML5 drag API

**Spec:** `docs/superpowers/specs/2026-03-16-topics-categories-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/main/db/schema.ts` | Modify | Add `main_categories`, `sub_categories` tables to `CREATE_TABLES`; `sub_category_id` on topics; migration v12; bump `SCHEMA_VERSION` |
| `src/main/db/index.ts` | Modify | Update `clearTopics()` + `clearProjectData()`; add `getFullHierarchy()`, `clearAndInsertCategories()`, `updateTopicCategory()`, `moveSubCategory()`, `renameMainCategory()`, `renameSubCategory()`, `reorderCategories()`, `createMainCategory()`, `createSubCategory()` |
| `src/types/index.ts` | Modify | Add `MainCategoryRow`, `SubCategoryRow`, `CategoryHierarchy` types |
| `src/main/topics/categorize.ts` | Create | `categorizeTopics(topics, apiKey)` — Gemini REST call + fallback; returns hierarchy for `clearAndInsertCategories()` |
| `src/main/topics/run.ts` | Modify | Call `categorizeTopics()` after `runClustering()` + `insertTopics()` complete |
| `src/main/ipc/handlers.ts` | Modify | Add all `categories:*` handlers + `report:generateForMain` + `report:generateForSub`; fire `topics:updated` after categorisation |
| `src/preload/index.ts` | Modify | Add preload entries for all new IPC channels |
| `src/renderer/src/components/TopicRow.tsx` | Create | Extract topic row JSX from `TopicsView.tsx`; Brief button, drag handle, right-click |
| `src/renderer/src/components/SubCategoryRow.tsx` | Create | Sub-category header row; collapse toggle, inline rename, drag target + draggable, Brief + Report |
| `src/renderer/src/components/CategoryRow.tsx` | Create | Main category header row; same as SubCategoryRow but navy style |
| `src/renderer/src/views/TopicsView.tsx` | Modify | Replace flat `TopicRow[]` fetch with `CategoryHierarchy`; render grouped table with DnD + context menu |

---

## Chunk 1: Data Layer

### Task 1: Schema v12

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: Add `main_categories` and `sub_categories` to `CREATE_TABLES`**

  In `schema.ts`, add after the `topic_keywords` block and before `organic_rankings`:

  ```sql
  CREATE TABLE IF NOT EXISTS main_categories (
    id       INTEGER PRIMARY KEY,
    label    TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sub_categories (
    id               INTEGER PRIMARY KEY,
    main_category_id INTEGER NOT NULL REFERENCES main_categories(id),
    label            TEXT    NOT NULL,
    position         INTEGER NOT NULL DEFAULT 0
  );
  ```

- [ ] **Step 2: Add `sub_category_id` to the `topics` CREATE TABLE block**

  Find the `topics` table definition in `CREATE_TABLES` and add the column:

  ```sql
  CREATE TABLE IF NOT EXISTS topics (
    id       INTEGER PRIMARY KEY,
    label    TEXT NOT NULL,
    keywords TEXT NOT NULL,
    centroid TEXT,
    sub_category_id INTEGER REFERENCES sub_categories(id)
  );
  ```

- [ ] **Step 3: Bump `SCHEMA_VERSION` and add migration v12**

  Change line 4:
  ```ts
  export const SCHEMA_VERSION = 12
  ```

  Add to `MIGRATIONS` after the `11:` entry:
  ```ts
  12: [
    `CREATE TABLE IF NOT EXISTS main_categories (
      id       INTEGER PRIMARY KEY,
      label    TEXT    NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sub_categories (
      id               INTEGER PRIMARY KEY,
      main_category_id INTEGER NOT NULL REFERENCES main_categories(id),
      label            TEXT    NOT NULL,
      position         INTEGER NOT NULL DEFAULT 0
    )`,
    `ALTER TABLE topics ADD COLUMN sub_category_id INTEGER REFERENCES sub_categories(id)`
  ].join(';\n')
  ```

- [ ] **Step 4: Smoke test — open the app, open an existing project, check DevTools console**

  Expected: no migration errors. Then open the `.aio-project.db` in a SQLite browser and confirm:
  ```sql
  SELECT name FROM sqlite_master WHERE type='table';
  -- main_categories and sub_categories appear
  PRAGMA table_info(topics);
  -- sub_category_id column present
  SELECT value FROM _meta WHERE key='schema_version';
  -- returns 12
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/main/db/schema.ts
  git commit -m "feat: add main_categories, sub_categories schema (v12 migration)"
  ```

---

### Task 2: Update `clearTopics()` and `clearProjectData()`

**Files:**
- Modify: `src/main/db/index.ts`

- [ ] **Step 1: Update `clearTopics()` with FK-safe teardown**

  Find `clearTopics()` at line ~751. Replace:
  ```ts
  export function clearTopics(): void {
    const db = getDB()
    db.exec('DELETE FROM topic_keywords; DELETE FROM topics;')
  }
  ```
  With:
  ```ts
  export function clearTopics(): void {
    const db = getDB()
    db.exec(`
      UPDATE topics SET sub_category_id = NULL;
      DELETE FROM sub_categories;
      DELETE FROM main_categories;
      DELETE FROM topic_keywords;
      DELETE FROM topics;
    `)
  }
  ```

- [ ] **Step 2: Update `clearProjectData()` with FK-safe teardown**

  Find `clearProjectData()` at line ~805. Replace its exec block:
  ```ts
  export function clearProjectData(): void {
    getDB().exec(`
      DELETE FROM organic_rankings;
      DELETE FROM snippet_matches;
      DELETE FROM page_sections;
      DELETE FROM crawled_pages;
      UPDATE topics SET sub_category_id = NULL;
      DELETE FROM sub_categories;
      DELETE FROM main_categories;
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

- [ ] **Step 3: Smoke test — in-app**

  Open the app, go to Setup → Danger Zone → Clear Project Data. Expected: no crash. Re-open the project and confirm all tables are empty, including `main_categories` and `sub_categories`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/db/index.ts
  git commit -m "fix: FK-safe teardown of main_categories/sub_categories in clearTopics and clearProjectData"
  ```

---

### Task 3: Add DB query functions

**Files:**
- Modify: `src/main/db/index.ts`

- [ ] **Step 1: Add `clearAndInsertCategories()` after `clearTopics()`**

  ```ts
  export interface CategoryHierarchyInput {
    mainCategories: {
      label: string
      subCategories: {
        label: string
        topicIds: number[]
      }[]
    }[]
  }

  export function clearAndInsertCategories(hierarchy: CategoryHierarchyInput): void {
    const db = getDB()
    const tx = db.transaction(() => {
      // FK-safe reset
      db.exec('UPDATE topics SET sub_category_id = NULL')
      db.exec('DELETE FROM sub_categories')
      db.exec('DELETE FROM main_categories')

      const insertMain = db.prepare(
        `INSERT INTO main_categories (label, position) VALUES (?, ?)`
      )
      const insertSub = db.prepare(
        `INSERT INTO sub_categories (main_category_id, label, position) VALUES (?, ?, ?)`
      )
      const assignTopic = db.prepare(
        `UPDATE topics SET sub_category_id = ? WHERE id = ?`
      )

      hierarchy.mainCategories.forEach((mc, mcPos) => {
        const mcRow = insertMain.run(mc.label, mcPos)
        const mcId = Number(mcRow.lastInsertRowid)

        mc.subCategories.forEach((sc, scPos) => {
          const scRow = insertSub.run(mcId, sc.label, scPos)
          const scId = Number(scRow.lastInsertRowid)

          for (const topicId of sc.topicIds) {
            assignTopic.run(scId, topicId)
          }
        })
      })
    })
    tx()
  }
  ```

- [ ] **Step 2: Add `getFullHierarchy()` after `getTopics()`**

  ```ts
  export interface FlatHierarchyRow {
    topicId: number
    topicLabel: string
    subCategoryId: number | null
    subCategoryLabel: string | null
    subCategoryPosition: number | null
    mainCategoryId: number | null
    mainCategoryLabel: string | null
    mainCategoryPosition: number | null
    memberCount: number
    avgSimilarity: number
    topKeywords: string | null
    topDomain: string | null
    topDomainCount: number | null
    bestDomain: string | null
    bestDomainPosition: number | null
    totalSearchVolume: number | null
  }

  export function getFullHierarchy(): FlatHierarchyRow[] {
    // Reuse the domain-stats CTE from getTopics(), adding category joins.
    return getDB().prepare(
      `WITH domain_agg AS (
         SELECT tk.topic_id,
                a.domain_root,
                COUNT(*)         AS cnt,
                MIN(a.position)  AS best_pos
         FROM aio_sources a
         JOIN topic_keywords tk ON tk.keyword_id = a.keyword_id
         WHERE a.domain_root != '' AND a.position BETWEEN 1 AND 10
         GROUP BY tk.topic_id, a.domain_root
       ),
       ranked AS (
         SELECT *,
                ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY cnt DESC)      AS rn_cnt,
                ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY best_pos ASC)  AS rn_pos
         FROM domain_agg
       )
       SELECT
         t.id                          AS topicId,
         t.label                       AS topicLabel,
         sc.id                         AS subCategoryId,
         sc.label                      AS subCategoryLabel,
         sc.position                   AS subCategoryPosition,
         mc.id                         AS mainCategoryId,
         mc.label                      AS mainCategoryLabel,
         mc.position                   AS mainCategoryPosition,
         COUNT(tk.keyword_id)          AS memberCount,
         ROUND(AVG(tk.similarity), 2)  AS avgSimilarity,
         (SELECT GROUP_CONCAT(sub.keyword, '|')
          FROM (SELECT k2.keyword
                FROM topic_keywords tk2
                JOIN keywords k2 ON k2.id = tk2.keyword_id
                WHERE tk2.topic_id = t.id
                ORDER BY tk2.similarity DESC
                LIMIT 5) sub
         )                             AS topKeywords,
         td.domain_root                AS topDomain,
         td.cnt                        AS topDomainCount,
         bd.domain_root                AS bestDomain,
         bd.best_pos                   AS bestDomainPosition,
         SUM(k.search_volume)          AS totalSearchVolume
       FROM topics t
       LEFT JOIN sub_categories sc ON sc.id = t.sub_category_id
       LEFT JOIN main_categories mc ON mc.id = sc.main_category_id
       LEFT JOIN topic_keywords tk ON tk.topic_id = t.id
       LEFT JOIN keywords k ON k.id = tk.keyword_id
       LEFT JOIN ranked td ON td.topic_id = t.id AND td.rn_cnt = 1
       LEFT JOIN ranked bd ON bd.topic_id = t.id AND bd.rn_pos = 1
       GROUP BY t.id
       ORDER BY mc.position ASC, sc.position ASC, memberCount DESC`
    ).all() as FlatHierarchyRow[]
  }
  ```

- [ ] **Step 3: Add mutation functions after `updateTopicLabel()`**

  ```ts
  export function updateTopicCategory(topicId: number, subCategoryId: number): void {
    getDB().prepare(`UPDATE topics SET sub_category_id = ? WHERE id = ?`).run(subCategoryId, topicId)
  }

  export function moveSubCategory(subCategoryId: number, mainCategoryId: number): void {
    getDB().prepare(`UPDATE sub_categories SET main_category_id = ? WHERE id = ?`).run(mainCategoryId, subCategoryId)
  }

  export function renameMainCategory(id: number, label: string): void {
    getDB().prepare(`UPDATE main_categories SET label = ? WHERE id = ?`).run(label, id)
  }

  export function renameSubCategory(id: number, label: string): void {
    getDB().prepare(`UPDATE sub_categories SET label = ? WHERE id = ?`).run(label, id)
  }

  export function reorderCategories(
    updates: { id: number; level: 'main' | 'sub'; position: number }[]
  ): void {
    const updateMain = getDB().prepare(`UPDATE main_categories SET position = ? WHERE id = ?`)
    const updateSub  = getDB().prepare(`UPDATE sub_categories  SET position = ? WHERE id = ?`)
    const tx = getDB().transaction(() => {
      for (const u of updates) {
        if (u.level === 'main') updateMain.run(u.position, u.id)
        else updateSub.run(u.position, u.id)
      }
    })
    tx()
  }

  export function createMainCategory(label: string): number {
    const db = getDB()
    const maxPos = (db.prepare(`SELECT MAX(position) AS p FROM main_categories`).get() as any)?.p ?? -1
    const row = db.prepare(`INSERT INTO main_categories (label, position) VALUES (?, ?)`).run(label, maxPos + 1)
    return Number(row.lastInsertRowid)
  }

  export function createSubCategory(label: string, mainCategoryId: number): number {
    const db = getDB()
    const maxPos = (db.prepare(
      `SELECT MAX(position) AS p FROM sub_categories WHERE main_category_id = ?`
    ).get(mainCategoryId) as any)?.p ?? -1
    const row = db.prepare(
      `INSERT INTO sub_categories (main_category_id, label, position) VALUES (?, ?, ?)`
    ).run(mainCategoryId, label, maxPos + 1)
    return Number(row.lastInsertRowid)
  }
  ```

- [ ] **Step 4: Write and run a ts-node smoke test**

  Create `src/main/db/categories.test.ts`:
  ```ts
  // Run: npx ts-node --project tsconfig.json src/main/db/categories.test.ts
  import Database from 'better-sqlite3'
  import { CREATE_TABLES } from './schema'

  // Inline minimal DB setup (in-memory)
  const db = new Database(':memory:')
  db.exec(CREATE_TABLES)
  db.prepare(`INSERT INTO _meta (key, value) VALUES ('schema_version', '12')`).run()
  db.prepare(`INSERT INTO project (name, created_at) VALUES ('test', 0)`).run()

  // Insert two topics
  const t1 = db.prepare(`INSERT INTO topics (label, keywords) VALUES ('Credit Cards', '[]')`).run()
  const t2 = db.prepare(`INSERT INTO topics (label, keywords) VALUES ('Personal Loans', '[]')`).run()

  // Manually create categories
  const mc = db.prepare(`INSERT INTO main_categories (label, position) VALUES ('Finance', 0)`).run()
  const sc = db.prepare(`INSERT INTO sub_categories (main_category_id, label, position) VALUES (?, 'Cards', 0)`).run(mc.lastInsertRowid)
  db.prepare(`UPDATE topics SET sub_category_id = ? WHERE id = ?`).run(sc.lastInsertRowid, t1.lastInsertRowid)

  // Test getFullHierarchy output
  const rows = db.prepare(`
    SELECT t.id AS topicId, sc.label AS subCategoryLabel, mc.label AS mainCategoryLabel
    FROM topics t
    LEFT JOIN sub_categories sc ON sc.id = t.sub_category_id
    LEFT JOIN main_categories mc ON mc.id = sc.main_category_id
  `).all() as any[]

  const errors: string[] = []
  const credit = rows.find(r => r.topicId === Number(t1.lastInsertRowid))
  if (!credit) errors.push('Credit Cards row not found')
  if (credit?.subCategoryLabel !== 'Cards') errors.push(`subCategoryLabel: expected Cards, got ${credit?.subCategoryLabel}`)
  if (credit?.mainCategoryLabel !== 'Finance') errors.push(`mainCategoryLabel: expected Finance, got ${credit?.mainCategoryLabel}`)
  const loans = rows.find(r => r.topicId === Number(t2.lastInsertRowid))
  if (loans?.subCategoryLabel !== null) errors.push(`Personal Loans should have null subCategoryLabel`)

  if (errors.length === 0) {
    console.log('✓ All DB category assertions passed')
  } else {
    console.error('✗ Failures:', errors)
    process.exit(1)
  }
  ```

  Run: `npx ts-node --project tsconfig.json src/main/db/categories.test.ts`
  Expected: `✓ All DB category assertions passed`

- [ ] **Step 5: Commit**

  ```bash
  git add src/main/db/index.ts src/main/db/categories.test.ts
  git commit -m "feat: add category DB functions (clearAndInsertCategories, getFullHierarchy, mutations)"
  ```

---

## Chunk 2: Engine + IPC

### Task 4: TypeScript types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add category types**

  Open `src/types/index.ts` and append:

  ```ts
  // ─── Category hierarchy ───────────────────────────────────────────────────────

  export interface SubCategoryRow {
    id: number
    mainCategoryId: number
    label: string
    position: number
    totalSearchVolume: number
    topDomain: string | null
    bestDomain: string | null
    bestDomainPosition: number | null
    topics: TopicRow[]
  }

  export interface MainCategoryRow {
    id: number
    label: string
    position: number
    totalSearchVolume: number
    subCategories: SubCategoryRow[]
  }

  export interface CategoryHierarchy {
    mainCategories: MainCategoryRow[]
    uncategorised: TopicRow[]
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/types/index.ts
  git commit -m "feat: add CategoryHierarchy, MainCategoryRow, SubCategoryRow types"
  ```

---

### Task 5: Categorisation engine

**Files:**
- Create: `src/main/topics/categorize.ts`

- [ ] **Step 1: Create `categorize.ts`**

  ```ts
  // Gemini-powered two-level category hierarchy generator.
  // Given an array of topic labels+IDs, asks gemini-2.5-pro to group them into
  // mainCategory → subCategory → topics. Falls back silently (returns null) on
  // any error so the caller can skip the DB write and leave topics uncategorised.

  import { fetch } from 'undici'
  import { log, logError } from '../logger'
  import type { CategoryHierarchyInput } from '../db'

  const GEMINI_BASE = 'https://generativelanguage.googleapis.com'

  interface GeminiCategory {
    label: string
    subCategories: {
      label: string
      topicLabels: string[]
    }[]
  }

  export async function categorizeTopics(
    topics: { id: number; label: string }[],
    apiKey: string
  ): Promise<CategoryHierarchyInput | null> {
    if (topics.length === 0) return null

    const labelList = topics.map((t, i) => `${i + 1}. ${t.label}`).join('\n')

    const prompt = `You are a semantic SEO categorisation assistant.

Group these ${topics.length} SEO topic labels into a two-level hierarchy.
Return ONLY a JSON object — no markdown, no explanation.
Every topic must appear in exactly one sub-category.
Aim for 3-8 main categories. Aim for 2-6 sub-categories per main category.

Topics:
${labelList}

Return format:
{
  "mainCategories": [
    {
      "label": "string",
      "subCategories": [
        {
          "label": "string",
          "topicLabels": ["exact topic label from the list"]
        }
      ]
    }
  ]
}`

    const schema = {
      type: 'object',
      properties: {
        mainCategories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              subCategories: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    topicLabels: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['label', 'topicLabels']
                }
              }
            },
            required: ['label', 'subCategories']
          }
        }
      },
      required: ['mainCategories']
    }

    try {
      const res = await fetch(
        `${GEMINI_BASE}/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: schema,
              temperature: 0.1
            }
          }),
          signal: AbortSignal.timeout(60_000)
        }
      )

      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)

      const body = await res.json() as any
      const text: string = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const parsed = JSON.parse(text) as { mainCategories: GeminiCategory[] }

      // Build a case-insensitive lookup from label → topic id
      const labelToId = new Map(topics.map(t => [t.label.toLowerCase(), t.id]))

      const hierarchy: CategoryHierarchyInput = {
        mainCategories: parsed.mainCategories.map(mc => ({
          label: mc.label,
          subCategories: mc.subCategories.map(sc => ({
            label: sc.label,
            topicIds: sc.topicLabels
              .map(l => labelToId.get(l.toLowerCase()))
              .filter((id): id is number => id !== undefined)
          }))
        }))
      }

      const assignedCount = hierarchy.mainCategories
        .flatMap(mc => mc.subCategories)
        .reduce((sum, sc) => sum + sc.topicIds.length, 0)
      log(`[categories] Gemini assigned ${assignedCount}/${topics.length} topics to categories`)

      return hierarchy
    } catch (err) {
      logError('[categories] Gemini categorisation failed — topics will be uncategorised', err)
      return null
    }
  }
  ```

- [ ] **Step 2: Smoke test — run a manual test**

  Create `src/main/topics/categorize.test.ts`:
  ```ts
  // Run: GEMINI_KEY=<your-key> npx ts-node --project tsconfig.json src/main/topics/categorize.test.ts
  import { categorizeTopics } from './categorize'

  const apiKey = process.env.GEMINI_KEY ?? ''
  if (!apiKey) { console.error('Set GEMINI_KEY env var'); process.exit(1) }

  const topics = [
    { id: 1, label: 'Best cashback credit cards' },
    { id: 2, label: 'Travel rewards cards comparison' },
    { id: 3, label: 'Personal loan rates 2024' },
    { id: 4, label: 'Home insurance quotes' },
    { id: 5, label: 'Car insurance for young drivers' }
  ]

  categorizeTopics(topics, apiKey).then(result => {
    if (!result) { console.error('✗ returned null'); process.exit(1) }
    const assigned = result.mainCategories.flatMap(mc => mc.subCategories).reduce((s, sc) => s + sc.topicIds.length, 0)
    console.log('Hierarchy:', JSON.stringify(result, null, 2))
    if (assigned !== 5) { console.error(`✗ Expected 5 assigned topics, got ${assigned}`); process.exit(1) }
    if (result.mainCategories.length === 0) { console.error('✗ No main categories returned'); process.exit(1) }
    console.log('✓ categorizeTopics returned valid hierarchy')
  })
  ```

  Run: `GEMINI_KEY=<your-key> npx ts-node --project tsconfig.json src/main/topics/categorize.test.ts`
  Expected: `✓ categorizeTopics returned valid hierarchy` with hierarchy JSON showing topics grouped.

- [ ] **Step 3: Commit**

  ```bash
  git add src/main/topics/categorize.ts src/main/topics/categorize.test.ts
  git commit -m "feat: add categorizeTopics Gemini engine with fallback"
  ```

---

### Task 6: Wire categorisation into `topics/run.ts`

**Files:**
- Modify: `src/main/topics/run.ts`

- [ ] **Step 1: Update `run.ts` to call `categorizeTopics` and write the hierarchy**

  Replace the entire file:
  ```ts
  // Async clustering + categorisation entry point.
  // 1. Clusters keywords into topics (Gemini or local fallback).
  // 2. Writes topics to DB.
  // 3. Calls Gemini to group topics into a 2-level category hierarchy.
  // 4. Writes the hierarchy to DB (or leaves topics uncategorised on fallback).
  import { clusterKeywords } from './cluster'
  import { clusterWithGemini } from '../gemini/client'
  import { categorizeTopics } from './categorize'
  import { readAllCredentials } from '../credentials'
  import { log, logError } from '../logger'
  import { getTopics, clearAndInsertCategories } from '../db'
  import type { ClusterInput, Cluster } from './cluster'

  export async function runClustering(inputs: ClusterInput[]): Promise<Cluster[]> {
    const geminiKey = readAllCredentials()['gemini']?.apiKey ?? ''

    if (geminiKey) {
      log(`[topics] clustering ${inputs.length} keywords with Gemini`)
      try {
        const clusters = await clusterWithGemini(
          inputs.map(k => ({ id: k.id, keyword: k.keyword })),
          geminiKey
        )
        log(`[topics] Gemini returned ${clusters.length} clusters`)
        return clusters
      } catch (err) {
        logError('[topics] Gemini clustering failed, falling back to local', err)
        const clusters = clusterKeywords(inputs)
        log(`[topics] local fallback returned ${clusters.length} clusters`)
        return clusters
      }
    }

    log(`[topics] clustering ${inputs.length} keywords with local algorithm`)
    const clusters = clusterKeywords(inputs)
    log(`[topics] local algorithm returned ${clusters.length} clusters`)
    return clusters
  }

  // Called after insertTopics() has written clusters to the DB.
  // Reads back the written topics (to get their DB IDs + labels), then calls
  // Gemini to produce a 2-level category hierarchy and writes it.
  export async function runCategorisation(): Promise<void> {
    const geminiKey = readAllCredentials()['gemini']?.apiKey ?? ''
    if (!geminiKey) {
      log('[categories] no Gemini key — topics will be uncategorised')
      return
    }

    const topics = getTopics().map(t => ({ id: t.id, label: t.label }))
    if (topics.length === 0) return

    log(`[categories] categorising ${topics.length} topics with Gemini`)
    const hierarchy = await categorizeTopics(topics, geminiKey)
    if (!hierarchy) {
      log('[categories] categorisation returned null — topics remain uncategorised')
      return
    }

    clearAndInsertCategories(hierarchy)
    log('[categories] hierarchy written to DB')
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/main/topics/run.ts
  git commit -m "feat: add runCategorisation() to topics/run.ts"
  ```

---

### Task 7: IPC handlers and preload

**Files:**
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add new DB function imports to `handlers.ts`**

  Add to the existing `import { ... } from '../db'` block:
  ```ts
  getFullHierarchy,
  updateTopicCategory,
  moveSubCategory,
  renameMainCategory,
  renameSubCategory,
  reorderCategories,
  createMainCategory,
  createSubCategory,
  ```

- [ ] **Step 2: Add `runCategorisation` import**

  ```ts
  import { runClustering, runCategorisation } from '../topics/run'
  ```

  (Replaces the existing `import { runClustering } from '../topics/run'`)

- [ ] **Step 3: Update the `topics:run` handler to call `runCategorisation` and fire `topics:updated`**

  Find the existing `topics:run` handler (~line 390):
  ```ts
  ipcMain.handle('topics:run', async () => {
    const inputs = getClusterableKeywords()
    const clusters = await runClustering(inputs)
    clearTopics()
    insertTopics(clusters)
    return { count: clusters.length }
  })
  ```

  Replace with:
  ```ts
  ipcMain.handle('topics:run', async () => {
    const inputs = getClusterableKeywords()
    const clusters = await runClustering(inputs)
    clearTopics()
    insertTopics(clusters)
    // Auto-categorise after clustering — fires async, no await needed in IPC handler
    // because categorisation is best-effort and we don't want to block the UI response.
    // When done, it fires topics:updated so the renderer refreshes the hierarchy.
    runCategorisation().then(() => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('topics:updated')
    }).catch(() => {
      // categorisation is non-critical — still notify renderer to refresh topics
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('topics:updated')
    })
    return { count: clusters.length }
  })
  ```

  Note: The handler returns immediately with the cluster count so the UI shows topics. The `topics:updated` event arrives a few seconds later once Gemini responds, which triggers a second refresh showing the hierarchy.

- [ ] **Step 4: Add category IPC handlers**

  Add after the topics handlers section:

  ```ts
  // ─── Categories ───────────────────────────────────────────────────────────────

  ipcMain.handle('categories:getHierarchy', () => {
    const rows = getFullHierarchy()

    // Group flat rows into nested CategoryHierarchy
    const mainMap = new Map<number, {
      id: number; label: string; position: number; totalSearchVolume: number
      subCategories: Map<number, {
        id: number; mainCategoryId: number; label: string; position: number; totalSearchVolume: number
        topics: typeof rows
      }>
    }>()

    const uncategorised: typeof rows = []

    for (const row of rows) {
      if (row.mainCategoryId === null || row.subCategoryId === null) {
        uncategorised.push(row)
        continue
      }

      if (!mainMap.has(row.mainCategoryId)) {
        mainMap.set(row.mainCategoryId, {
          id: row.mainCategoryId,
          label: row.mainCategoryLabel!,
          position: row.mainCategoryPosition!,
          totalSearchVolume: 0,
          subCategories: new Map()
        })
      }
      const mc = mainMap.get(row.mainCategoryId)!

      if (!mc.subCategories.has(row.subCategoryId)) {
        mc.subCategories.set(row.subCategoryId, {
          id: row.subCategoryId,
          mainCategoryId: row.mainCategoryId,
          label: row.subCategoryLabel!,
          position: row.subCategoryPosition!,
          totalSearchVolume: 0,
          topics: []
        })
      }
      const sc = mc.subCategories.get(row.subCategoryId)!
      sc.topics.push(row)
      sc.totalSearchVolume += row.totalSearchVolume ?? 0
      mc.totalSearchVolume += row.totalSearchVolume ?? 0
    }

    return {
      mainCategories: Array.from(mainMap.values())
        .sort((a, b) => a.position - b.position)
        .map(mc => ({
          ...mc,
          subCategories: Array.from(mc.subCategories.values())
            .sort((a, b) => a.position - b.position)
        })),
      uncategorised
    }
  })

  ipcMain.handle('categories:updateTopicCategory', (_e, topicId: number, subCategoryId: number) => {
    updateTopicCategory(topicId, subCategoryId)
  })

  ipcMain.handle('categories:moveSubCategory', (_e, subCategoryId: number, mainCategoryId: number) => {
    moveSubCategory(subCategoryId, mainCategoryId)
  })

  ipcMain.handle('categories:renameMain', (_e, id: number, label: string) => {
    renameMainCategory(id, label)
  })

  ipcMain.handle('categories:renameSub', (_e, id: number, label: string) => {
    renameSubCategory(id, label)
  })

  ipcMain.handle('categories:reorder', (_e, updates: { id: number; level: 'main' | 'sub'; position: number }[]) => {
    reorderCategories(updates)
  })

  ipcMain.handle('categories:createMain', (_e, label: string) => {
    return createMainCategory(label)
  })

  ipcMain.handle('categories:createSub', (_e, label: string, mainCategoryId: number) => {
    return createSubCategory(label, mainCategoryId)
  })
  ```

- [ ] **Step 5: Add scoped report handlers**

  Add after the `report:generate` handler:

  ```ts
  ipcMain.handle('report:generateForMain', async (_e, mainCategoryId: number) => {
    const meta   = getProjectMeta()
    const stats  = getProjectStats()
    const pivot  = getAIODomainPivot(false)
    const allTopics = getTopics()

    // Get sub-category IDs for this main category, then filter topics
    const subCatIds = getDB()
      .prepare(`SELECT id FROM sub_categories WHERE main_category_id = ?`)
      .all(mainCategoryId)
      .map((r: any) => r.id as number)

    const topicIds = subCatIds.length > 0
      ? getDB()
          .prepare(`SELECT id FROM topics WHERE sub_category_id IN (${subCatIds.map(() => '?').join(',')})`)
          .all(...subCatIds)
          .map((r: any) => r.id as number)
      : []

    const filteredTopics = allTopics.filter(t => topicIds.includes(t.id))

    const mainLabel = getDB()
      .prepare(`SELECT label FROM main_categories WHERE id = ?`)
      .get(mainCategoryId) as { label: string } | undefined

    const topicData = filteredTopics.map(topic => ({
      topic,
      keywords: getTopicKeywords(topic.id),
      elements: getTopicElementBreakdown(topic.id),
      schemas: getTopicSchemaCounts(topic.id)
    }))

    const html = buildReportHTML({ meta, stats, pivot, topics: topicData, generatedAt: Date.now() })
    const label = mainLabel?.label ?? `Category_${mainCategoryId}`
    const filePath = resolveExportPath(
      `${label.replace(/[^a-z0-9]/gi, '_')}_AIO_Report.html`,
      'fanout-report-'
    )
    writeFileSync(filePath, html, 'utf8')
    await shell.openPath(filePath)
    return { filePath }
  })

  ipcMain.handle('report:generateForSub', async (_e, subCategoryId: number) => {
    const meta   = getProjectMeta()
    const stats  = getProjectStats()
    const pivot  = getAIODomainPivot(false)
    const allTopics = getTopics()

    const topicIds = getDB()
      .prepare(`SELECT id FROM topics WHERE sub_category_id = ?`)
      .all(subCategoryId)
      .map((r: any) => r.id as number)

    const filteredTopics = allTopics.filter(t => topicIds.includes(t.id))

    const subLabel = getDB()
      .prepare(`SELECT label FROM sub_categories WHERE id = ?`)
      .get(subCategoryId) as { label: string } | undefined

    const topicData = filteredTopics.map(topic => ({
      topic,
      keywords: getTopicKeywords(topic.id),
      elements: getTopicElementBreakdown(topic.id),
      schemas: getTopicSchemaCounts(topic.id)
    }))

    const html = buildReportHTML({ meta, stats, pivot, topics: topicData, generatedAt: Date.now() })
    const label = subLabel?.label ?? `SubCategory_${subCategoryId}`
    const filePath = resolveExportPath(
      `${label.replace(/[^a-z0-9]/gi, '_')}_AIO_Report.html`,
      'fanout-report-'
    )
    writeFileSync(filePath, html, 'utf8')
    await shell.openPath(filePath)
    return { filePath }
  })
  ```

- [ ] **Step 6: Add preload entries to `src/preload/index.ts`**

  Import the new types at the top of the file:
  ```ts
  import type {
    // ... existing imports ...
    CategoryHierarchy
  } from '../types'
  ```

  Add in the `// ─── Topics ───` section after `generateTopicBrief`:
  ```ts
  // ─── Categories ───────────────────────────────────────────────────────────────
  getCategoryHierarchy: (): Promise<CategoryHierarchy> =>
    ipcRenderer.invoke('categories:getHierarchy'),

  updateTopicCategory: (topicId: number, subCategoryId: number): Promise<void> =>
    ipcRenderer.invoke('categories:updateTopicCategory', topicId, subCategoryId),

  moveSubCategory: (subCategoryId: number, mainCategoryId: number): Promise<void> =>
    ipcRenderer.invoke('categories:moveSubCategory', subCategoryId, mainCategoryId),

  renameMainCategory: (id: number, label: string): Promise<void> =>
    ipcRenderer.invoke('categories:renameMain', id, label),

  renameSubCategory: (id: number, label: string): Promise<void> =>
    ipcRenderer.invoke('categories:renameSub', id, label),

  reorderCategories: (updates: { id: number; level: 'main' | 'sub'; position: number }[]): Promise<void> =>
    ipcRenderer.invoke('categories:reorder', updates),

  createMainCategory: (label: string): Promise<number> =>
    ipcRenderer.invoke('categories:createMain', label),

  createSubCategory: (label: string, mainCategoryId: number): Promise<number> =>
    ipcRenderer.invoke('categories:createSub', label, mainCategoryId),

  generateReportForMain: (mainCategoryId: number): Promise<{ filePath: string }> =>
    ipcRenderer.invoke('report:generateForMain', mainCategoryId),

  generateReportForSub: (subCategoryId: number): Promise<{ filePath: string }> =>
    ipcRenderer.invoke('report:generateForSub', subCategoryId),
  ```

- [ ] **Step 7: Build check**

  ```bash
  npx electron-vite build 2>&1 | tail -20
  ```
  Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

  ```bash
  git add src/main/ipc/handlers.ts src/preload/index.ts
  git commit -m "feat: add categories IPC handlers, preload entries, scoped report generators"
  ```

---

## Chunk 3: Frontend

### Task 8: Extract `TopicRow.tsx`

**Files:**
- Create: `src/renderer/src/components/TopicRow.tsx`
- Modify: `src/renderer/src/views/TopicsView.tsx` (remove inline topic row JSX)

The current `TopicsView.tsx` renders topic rows inline. Extract this into a focused component.

- [ ] **Step 1: Read the current topic row JSX in `TopicsView.tsx` and note the inline `<tr>` block**

  Open `src/renderer/src/views/TopicsView.tsx`. Identify the `<tr>` block that renders each individual topic (not the clustering button or stats bar — just the per-topic row). Note the exact start and end lines — you will delete this block in Task 11, Step 8 when the table body is replaced. Do **not** delete it yet.

- [ ] **Step 2: Create `TopicRow.tsx`**

  ```tsx
  import React from 'react'
  import type { TopicRow as TopicRowData } from '../../../types'

  interface Props {
    topic: TopicRowData
    onBrief: (topicId: number) => void
    onRename: (topicId: number, currentLabel: string, x: number, y: number) => void
    onDragStart: (e: React.DragEvent, topicId: number) => void
    onContextMenu: (e: React.MouseEvent, topicId: number, topicLabel: string, parentMainCategoryId: number) => void
    parentMainCategoryId: number
  }

  export function TopicRow({ topic, onBrief, onRename, onDragStart, onContextMenu, parentMainCategoryId }: Props): JSX.Element {
    return (
      <tr
        draggable
        onDragStart={e => onDragStart(e, topic.id)}
        onContextMenu={e => onContextMenu(e, topic.id, topic.label, parentMainCategoryId)}
        className="border-b border-gray-100 hover:bg-gray-50 cursor-grab active:cursor-grabbing"
      >
        {/* indent */}
        <td className="pl-10 pr-3 py-1.5 text-sm text-gray-800">
          <span className="text-gray-300 mr-2 select-none">⠿</span>
          <button
            onClick={e => onRename(topic.id, topic.label, e.clientX, e.clientY)}
            className="hover:underline text-left"
          >
            {topic.label}
          </button>
          {topic.topKeywords && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {topic.topKeywords.split('|').map(kw => (
                <span key={kw} className="text-xs text-gray-400">{kw}</span>
              ))}
            </div>
          )}
        </td>
        <td className="px-3 py-1.5 text-right text-sm text-gray-500 tabular-nums">
          {topic.totalSearchVolume != null
            ? `$${topic.totalSearchVolume.toLocaleString()}`
            : '—'}
        </td>
        <td className="px-3 py-1.5 text-right text-sm text-gray-500 tabular-nums">
          {topic.memberCount}
        </td>
        <td className="px-3 py-1.5 text-right text-xs text-gray-500 font-mono">
          {topic.topDomain ?? '—'}
        </td>
        <td className="px-3 py-1.5 text-right">
          {topic.bestDomainPosition != null
            ? <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">{topic.bestDomainPosition}</span>
            : <span className="text-gray-300 text-sm">—</span>}
        </td>
        {/* Brief column */}
        <td className="px-3 py-1.5 text-right">
          <button
            onClick={() => onBrief(topic.id)}
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
          >
            Brief
          </button>
        </td>
        {/* Report column — empty for topics */}
        <td className="px-3 py-1.5" />
      </tr>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/renderer/src/components/TopicRow.tsx
  git commit -m "feat: extract TopicRow component with drag handle and context menu hook"
  ```

---

### Task 9: `SubCategoryRow.tsx`

**Files:**
- Create: `src/renderer/src/components/SubCategoryRow.tsx`

- [ ] **Step 1: Create `SubCategoryRow.tsx`**

  ```tsx
  import React, { useState } from 'react'
  import type { SubCategoryRow as SubCategoryRowData } from '../../../types'
  import { TopicRow as TopicRowComp } from './TopicRow'

  interface Props {
    subCategory: SubCategoryRowData
    isExpanded: boolean
    onToggle: () => void
    onBrief: (id: number) => void  // positive = topic id, negative = sub-cat id encoding (see handleBrief convention)
    onReport: (subCategoryId: number) => void
    onRenameSub: (id: number, currentLabel: string, x: number, y: number) => void
    onRenameTopic: (id: number, currentLabel: string, x: number, y: number) => void
    onTopicDragStart: (e: React.DragEvent, topicId: number) => void
    onTopicContextMenu: (e: React.MouseEvent, topicId: number, topicLabel: string, parentMainCategoryId: number) => void
    onSubContextMenu: (e: React.MouseEvent, subId: number, label: string) => void
    onDragStart: (e: React.DragEvent, subCategoryId: number) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent, targetSubCategoryId: number) => void
    parentMainCategoryId: number
  }

  export function SubCategoryRow({
    subCategory, isExpanded, onToggle,
    onBrief, onReport, onRenameSub, onRenameTopic,
    onTopicDragStart, onTopicContextMenu, onSubContextMenu,
    onDragStart, onDragOver, onDrop,
    parentMainCategoryId
  }: Props): JSX.Element {
    const [dragOver, setDragOver] = useState(false)

    return (
      <>
        {/* Sub-category header row */}
        <tr
          draggable
          onDragStart={e => onDragStart(e, subCategory.id)}
          onDragOver={e => { e.preventDefault(); setDragOver(true); onDragOver(e) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { setDragOver(false); onDrop(e, subCategory.id) }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onSubContextMenu(e, subCategory.id, subCategory.label) }}
          className={`border-b border-blue-200 cursor-pointer select-none ${dragOver ? 'bg-blue-100' : 'bg-blue-50'}`}
          onClick={onToggle}
        >
          <td className="pl-6 pr-3 py-1.5 text-sm font-semibold text-blue-800">
            <span className="mr-2 text-xs text-blue-400">{isExpanded ? '▼' : '▶'}</span>
            <button
              onClick={e => { e.stopPropagation(); onRenameSub(subCategory.id, subCategory.label, e.clientX, e.clientY) }}
              className="hover:underline"
            >
              {subCategory.label}
            </button>
            <span className="ml-2 text-xs font-normal text-blue-400">
              {subCategory.topics.length} topic{subCategory.topics.length !== 1 ? 's' : ''}
            </span>
          </td>
          <td className="px-3 py-1.5 text-right text-sm text-blue-700 tabular-nums">
            {subCategory.totalSearchVolume > 0
              ? `$${subCategory.totalSearchVolume.toLocaleString()}`
              : '—'}
          </td>
          <td className="px-3 py-1.5 text-right text-sm text-blue-700 tabular-nums">
            {subCategory.topics.reduce((s, t) => s + t.memberCount, 0)}
          </td>
          <td className="px-3 py-1.5 text-right text-xs text-gray-500 font-mono">
            {subCategory.topDomain ?? '—'}
          </td>
          <td className="px-3 py-1.5 text-right">
            {subCategory.bestDomainPosition != null
              ? <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">{subCategory.bestDomainPosition}</span>
              : <span className="text-gray-300 text-sm">—</span>}
          </td>
          {/* Brief */}
          <td className="px-3 py-1.5 text-right" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onBrief(-subCategory.id)}  // negative ID signals sub-category brief
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Brief
            </button>
          </td>
          {/* Report */}
          <td className="px-3 py-1.5 text-right" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onReport(subCategory.id)}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              📄 Report
            </button>
          </td>
        </tr>

        {/* Topic rows */}
        {isExpanded && subCategory.topics.map(topic => (
          <TopicRowComp
            key={topic.id}
            topic={topic}
            onBrief={onBrief}
            onRename={(id, label, x, y) => onRenameTopic(id, label, x, y)}
            onDragStart={onTopicDragStart}
            onContextMenu={onTopicContextMenu}
            parentMainCategoryId={parentMainCategoryId}
          />
        ))}
      </>
    )
  }
  ```

  Note: `onBrief(-subCategory.id)` passes a negative ID as a convention to signal "brief for a sub-category" to the shared brief handler in `TopicsView`. This avoids adding a separate prop/callback. The handler in `TopicsView` checks `id < 0` → sub-category brief.

- [ ] **Step 2: Commit**

  ```bash
  git add src/renderer/src/components/SubCategoryRow.tsx
  git commit -m "feat: add SubCategoryRow component with collapse, drag, Brief + Report"
  ```

---

### Task 10: `CategoryRow.tsx`

**Files:**
- Create: `src/renderer/src/components/CategoryRow.tsx`

- [ ] **Step 1: Create `CategoryRow.tsx`**

  ```tsx
  import React, { useState } from 'react'
  import type { MainCategoryRow as MainCategoryRowData } from '../../../types'
  import { SubCategoryRow } from './SubCategoryRow'

  interface Props {
    category: MainCategoryRowData
    expandedSubs: Set<number>
    onToggleSub: (subId: number) => void
    onToggleAll: (mainCategoryId: number, expand: boolean) => void
    onBrief: (id: number) => void  // positive = topic, negative = sub-cat, -(id+100000) = main cat
    onReportMain: (mainCategoryId: number) => void
    onReportSub: (subCategoryId: number) => void
    onRenameMain: (id: number, currentLabel: string, x: number, y: number) => void
    onRenameSub: (id: number, currentLabel: string, x: number, y: number) => void
    onRenameTopic: (id: number, currentLabel: string, x: number, y: number) => void
    onTopicDragStart: (e: React.DragEvent, topicId: number) => void
    onTopicContextMenu: (e: React.MouseEvent, topicId: number, topicLabel: string, parentMainCategoryId: number) => void
    onSubContextMenu: (e: React.MouseEvent, subId: number, label: string) => void
    onMainContextMenu: (e: React.MouseEvent, mainId: number, label: string) => void
    onSubDragStart: (e: React.DragEvent, subCategoryId: number) => void
    onDragOver: (e: React.DragEvent) => void
    onDropOnSub: (e: React.DragEvent, targetSubCategoryId: number) => void
    onDropOnMain: (e: React.DragEvent, targetMainCategoryId: number) => void
  }

  export function CategoryRow({
    category, expandedSubs, onToggleSub, onToggleAll,
    onBrief, onReportMain, onReportSub,
    onRenameMain, onRenameSub, onRenameTopic,
    onTopicDragStart, onTopicContextMenu, onSubContextMenu, onMainContextMenu,
    onSubDragStart, onDragOver, onDropOnSub, onDropOnMain
  }: Props): JSX.Element {
    const allExpanded = category.subCategories.every(sc => expandedSubs.has(sc.id))
    const [dragOver, setDragOver] = useState(false)

    return (
      <>
        {/* Main category header */}
        <tr
          onDragOver={e => { e.preventDefault(); setDragOver(true); onDragOver(e) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { setDragOver(false); onDropOnMain(e, category.id) }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMainContextMenu(e, category.id, category.label) }}
          className={`border-b-2 border-blue-900 select-none ${dragOver ? 'opacity-80' : ''}`}
          style={{ background: '#1e3a5f' }}
        >
          <td className="pl-3 pr-3 py-2 text-sm font-bold text-white">
            <button
              onClick={() => onToggleAll(category.id, !allExpanded)}
              className="mr-2 text-xs text-blue-300"
            >
              {allExpanded ? '▼' : '▶'}
            </button>
            <button
              onClick={e => onRenameMain(category.id, category.label, e.clientX, e.clientY)}
              className="hover:underline"
            >
              {category.label}
            </button>
            <span className="ml-2 text-xs font-normal text-blue-300">
              {category.subCategories.length} sub-categories
            </span>
          </td>
          <td className="px-3 py-2 text-right text-sm text-blue-200 tabular-nums">
            {category.totalSearchVolume > 0
              ? `$${category.totalSearchVolume.toLocaleString()}`
              : '—'}
          </td>
          <td className="px-3 py-2 text-right text-sm text-blue-200 tabular-nums">
            {category.subCategories.reduce((s, sc) => s + sc.topics.reduce((ss, t) => ss + t.memberCount, 0), 0)}
          </td>
          <td className="px-3 py-2 text-right text-xs text-blue-300">—</td>
          <td className="px-3 py-2 text-right text-xs text-blue-300">—</td>
          {/* Brief */}
          <td className="px-3 py-2 text-right">
            <button
              onClick={() => onBrief(-(category.id + 100000))}  // convention: -(id+100000) = main cat brief
              className="text-xs px-2 py-1 rounded text-white border border-white/30 hover:border-white/60"
            >
              Brief
            </button>
          </td>
          {/* Report */}
          <td className="px-3 py-2 text-right">
            <button
              onClick={() => onReportMain(category.id)}
              className="text-xs px-2 py-1 rounded text-white border border-white/30 hover:border-white/60"
            >
              📄 Report
            </button>
          </td>
        </tr>

        {/* Sub-category rows */}
        {category.subCategories.map(sc => (
          <SubCategoryRow
            key={sc.id}
            subCategory={sc}
            isExpanded={expandedSubs.has(sc.id)}
            onToggle={() => onToggleSub(sc.id)}
            onBrief={onBrief}
            onReport={onReportSub}
            onRenameSub={onRenameSub}
            onRenameTopic={onRenameTopic}
            onTopicDragStart={onTopicDragStart}
            onTopicContextMenu={onTopicContextMenu}
            onSubContextMenu={onSubContextMenu}
            onDragStart={onSubDragStart}
            onDragOver={onDragOver}
            onDrop={onDropOnSub}
            parentMainCategoryId={category.id}
          />
        ))}
      </>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/renderer/src/components/CategoryRow.tsx
  git commit -m "feat: add CategoryRow component with DnD drop target, Brief + Report"
  ```

---

### Task 11: Refactor `TopicsView.tsx`

**Files:**
- Modify: `src/renderer/src/views/TopicsView.tsx`

This is the largest change. The flat `TopicRow[]` query is replaced with `CategoryHierarchy`. The existing inline topic row JSX is replaced with the new components.

- [ ] **Step 1: Add `useRef` to the React import and replace the `getTopics` query with `getCategoryHierarchy`**

  Add `useRef` to the existing React hooks import line in `TopicsView.tsx` (look for `useState`, `useEffect`, `useRef`, etc. — they are likely already imported; add `useRef` if missing):
  ```ts
  import { useState, useEffect, useRef } from 'react'
  ```

  Find the TanStack Query call that fetches topics:
  ```ts
  const { data: topics = [], ... } = useQuery({
    queryKey: ['topics'],
    queryFn: () => window.api.getTopics(),
    ...
  })
  ```

  Replace with:
  ```ts
  const { data: hierarchy } = useQuery({
    queryKey: ['categories', 'hierarchy'],
    queryFn: () => window.api.getCategoryHierarchy(),
    enabled: !!project
  })
  ```

- [ ] **Step 2: Update the `onTopicsUpdated` listener**

  Find the `onTopicsUpdated` effect and add hierarchy invalidation:
  ```ts
  useEffect(() => {
    return window.api.onTopicsUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['topics'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    })
  }, [queryClient])
  ```

- [ ] **Step 3: Add collapse state**

  ```ts
  const [expandedSubs, setExpandedSubs] = useState<Set<number>>(new Set())

  function toggleSub(subId: number): void {
    setExpandedSubs(prev => {
      const next = new Set(prev)
      if (next.has(subId)) next.delete(subId)
      else next.add(subId)
      return next
    })
  }

  function toggleAllInMain(mainCategoryId: number, expand: boolean): void {
    const mc = hierarchy?.mainCategories.find(m => m.id === mainCategoryId)
    if (!mc) return
    setExpandedSubs(prev => {
      const next = new Set(prev)
      mc.subCategories.forEach(sc => expand ? next.add(sc.id) : next.delete(sc.id))
      return next
    })
  }
  ```

- [ ] **Step 4: Add inline rename state (shared for main cats, sub cats, topics)**

  ```ts
  const [renameTarget, setRenameTarget] = useState<{
    type: 'main' | 'sub' | 'topic'
    id: number
    label: string
    x: number  // position of rename input overlay (near the clicked label)
    y: number
  } | null>(null)

  // x/y should be the clientX/clientY of the triggering click (or ctxMenu coords for context-menu renames)
  function startRename(type: 'main' | 'sub' | 'topic', id: number, currentLabel: string, x: number, y: number): void {
    setRenameTarget({ type, id, label: currentLabel, x, y })
  }

  async function saveRename(newLabel: string): Promise<void> {
    if (!renameTarget || !newLabel.trim()) { setRenameTarget(null); return }
    if (renameTarget.type === 'main') await window.api.renameMainCategory(renameTarget.id, newLabel)
    else if (renameTarget.type === 'sub') await window.api.renameSubCategory(renameTarget.id, newLabel)
    else await window.api.updateTopicLabel(renameTarget.id, newLabel)
    setRenameTarget(null)
    queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    queryClient.invalidateQueries({ queryKey: ['topics'] })
  }
  ```

- [ ] **Step 5: Add drag-and-drop handlers**

  ```ts
  const dragRef = useRef<{ type: 'topic' | 'subcategory'; id: number } | null>(null)

  function handleTopicDragStart(e: React.DragEvent, topicId: number): void {
    dragRef.current = { type: 'topic', id: topicId }
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleSubDragStart(e: React.DragEvent, subCategoryId: number): void {
    dragRef.current = { type: 'subcategory', id: subCategoryId }
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault()
  }

  async function handleDropOnSub(e: React.DragEvent, targetSubCategoryId: number): Promise<void> {
    e.preventDefault()
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'topic') {
      await window.api.updateTopicCategory(drag.id, targetSubCategoryId)
    }
    // sub → sub is not a valid drop (sub-categories move to main categories, not other subs)
    dragRef.current = null
    // Compute new positions and batch update
    queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
  }

  async function handleDropOnMain(e: React.DragEvent, targetMainCategoryId: number): Promise<void> {
    e.preventDefault()
    const drag = dragRef.current
    if (!drag || drag.type !== 'subcategory') return
    await window.api.moveSubCategory(drag.id, targetMainCategoryId)
    dragRef.current = null
    queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
  }
  ```

- [ ] **Step 6: Add context menu state and handler**

  ```ts
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number
    type: 'topic' | 'sub' | 'main'
    id: number
    label: string
    parentMainCategoryId?: number
  } | null>(null)

  function handleContextMenu(
    e: React.MouseEvent,
    type: 'topic' | 'sub' | 'main',
    id: number,
    label: string,
    parentMainCategoryId?: number
  ): void {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, type, id, label, parentMainCategoryId })
  }

  async function handleMoveTopicToSub(subCategoryId: number): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'topic') return
    await window.api.updateTopicCategory(ctxMenu.id, subCategoryId)
    setCtxMenu(null)
    queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
  }

  async function handleMoveTopicToNewSub(): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'topic' || !ctxMenu.parentMainCategoryId) return
    // Capture coords before dismissing ctxMenu (setCtxMenu(null) clears them)
    const { x, y, parentMainCategoryId, id: topicId } = ctxMenu
    const newSubId = await window.api.createSubCategory('New Sub-category', parentMainCategoryId)
    await window.api.updateTopicCategory(topicId, newSubId)
    setCtxMenu(null)
    queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    startRename('sub', newSubId, 'New Sub-category', x, y)
  }

  async function handleMoveSubToMain(mainCategoryId: number): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'sub') return
    await window.api.moveSubCategory(ctxMenu.id, mainCategoryId)
    setCtxMenu(null)
    queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
  }

  async function handleMoveSubToNewMain(): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'sub') return
    // Capture coords before dismissing ctxMenu
    const { x, y, id: subId } = ctxMenu
    const newMainId = await window.api.createMainCategory('New Category')
    await window.api.moveSubCategory(subId, newMainId)
    setCtxMenu(null)
    queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    startRename('main', newMainId, 'New Category', x, y)
  }
  ```

- [ ] **Step 7: Add brief handler (works for all levels)**

  ```ts
  // id convention: positive = topic, negative 1–99999 = -(subCategoryId), -(id+100000) = main cat
  async function handleBrief(id: number): Promise<void> {
    if (id >= 0) {
      // topic brief — same as before
      const result = await window.api.generateTopicBrief(id)
      setBrief(result.brief)
    } else if (id > -100000) {
      // sub-category brief — uses the first (highest-traffic) topic as a representative proxy.
      // Deliberate scope: generateTopicBrief is single-topic only; a true multi-topic brief
      // is out of scope for this feature and would need a separate Gemini prompt.
      const subCatId = -id
      const sc = hierarchy?.mainCategories.flatMap(mc => mc.subCategories).find(s => s.id === subCatId)
      if (!sc) return
      const topTopic = sc.topics[0]
      if (!topTopic) return
      const result = await window.api.generateTopicBrief(topTopic.id)
      setBrief(result.brief)
    } else {
      // main category brief — uses the first topic in the first sub-category as a proxy.
      // Same deliberate constraint as sub-category brief above.
      const mainId = -(id + 100000)
      const mc = hierarchy?.mainCategories.find(m => m.id === mainId)
      if (!mc || mc.subCategories.length === 0) return
      const topTopic = mc.subCategories[0]?.topics[0]
      if (!topTopic) return
      const result = await window.api.generateTopicBrief(topTopic.id)
      setBrief(result.brief)
    }
  }
  ```

  Note: Brief at sub-category and main category level uses the first (highest-traffic) topic in that group as a representative sample. This is deliberate — `generateTopicBrief` is a single-topic API; a true multi-topic category brief is out of scope here. The Brief button label at category level should read "Brief" (same as topic rows) — no special labelling needed since the proxy behaviour is acceptable for v1.

- [ ] **Step 8: Replace the table body with `CategoryRow` components**

  Add imports at the top of `TopicsView.tsx`:
  ```ts
  import { CategoryRow } from '../components/CategoryRow'
  import { TopicRow } from '../components/TopicRow'
  ```

  Replace the existing table `<tbody>` block with:
  ```tsx
  <tbody>
    {hierarchy?.mainCategories.map(mc => (
      <CategoryRow
        key={mc.id}
        category={mc}
        expandedSubs={expandedSubs}
        onToggleSub={toggleSub}
        onToggleAll={toggleAllInMain}
        onBrief={handleBrief}
        onReportMain={async (id) => window.api.generateReportForMain(id)}
        onReportSub={async (id) => window.api.generateReportForSub(id)}
        onRenameMain={(id, label, x, y) => startRename('main', id, label, x, y)}
        onRenameSub={(id, label, x, y) => startRename('sub', id, label, x, y)}
        onRenameTopic={(id, label, x, y) => startRename('topic', id, label, x, y)}
        onTopicDragStart={handleTopicDragStart}
        onTopicContextMenu={(e, id, label, parentMainId) => handleContextMenu(e, 'topic', id, label, parentMainId)}
        onSubContextMenu={(e, id, label) => handleContextMenu(e, 'sub', id, label)}
        onMainContextMenu={(e, id, label) => handleContextMenu(e, 'main', id, label)}
        onSubDragStart={handleSubDragStart}
        onDragOver={handleDragOver}
        onDropOnSub={handleDropOnSub}
        onDropOnMain={handleDropOnMain}
      />
    ))}

    {/* Uncategorised bucket */}
    {(hierarchy?.uncategorised.length ?? 0) > 0 && (
      <>
        <tr className="border-b-2 border-gray-400" style={{ background: '#374151' }}>
          <td colSpan={7} className="pl-3 py-2 text-sm font-bold text-white">
            <button onClick={() => toggleSub(-1)} className="mr-2 text-xs text-gray-300">
              {expandedSubs.has(-1) ? '▼' : '▶'}
            </button>
            Uncategorised
            <span className="ml-2 text-xs font-normal text-gray-400">
              {hierarchy!.uncategorised.length} topic{hierarchy!.uncategorised.length !== 1 ? 's' : ''}
            </span>
          </td>
        </tr>
        {expandedSubs.has(-1) && hierarchy!.uncategorised.map(topic => (
          <TopicRow
            key={topic.id}
            topic={topic}
            onBrief={handleBrief}
            onRename={(id, label, x, y) => startRename('topic', id, label, x, y)}
            onDragStart={handleTopicDragStart}
            onContextMenu={(e, id, label) => handleContextMenu(e, 'topic', id, label, undefined)}
            parentMainCategoryId={-1}
          />
        ))}
      </>
    )}
  </tbody>
  ```

- [ ] **Step 9: Add context menu JSX and rename input overlay**

  At the root of the returned JSX (just before the closing `</div>`), add:

  Add two `useEffect`s — one for Escape, one for click-away:
  ```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!ctxMenu) return
    const onMouseDown = () => setCtxMenu(null)
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [ctxMenu])
  ```

  ```tsx
  {/* Context menu — dismissed on click-away (document mousedown) or Escape */}
  {ctxMenu && (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 text-sm min-w-[180px]"
      style={{ left: ctxMenu.x, top: ctxMenu.y }}
      onMouseDown={e => e.stopPropagation()}  {/* prevent click-away handler from firing on menu itself */}
    >
      <button
        onClick={() => { startRename(ctxMenu.type, ctxMenu.id, ctxMenu.label, ctxMenu.x, ctxMenu.y); setCtxMenu(null) }}
        className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
      >
        Rename
      </button>
      {ctxMenu.type === 'topic' && (
        <>
          <div className="px-3 py-1 text-xs text-gray-400 font-semibold uppercase tracking-wide border-t mt-1 pt-1">Move to sub-category</div>
          {hierarchy?.mainCategories.flatMap(mc => mc.subCategories).map(sc => (
            <button
              key={sc.id}
              onClick={() => handleMoveTopicToSub(sc.id)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
            >
              {sc.label}
            </button>
          ))}
          <button
            onClick={handleMoveTopicToNewSub}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-blue-600"
          >
            + New sub-category…
          </button>
        </>
      )}
      {ctxMenu.type === 'sub' && (
        <>
          <div className="px-3 py-1 text-xs text-gray-400 font-semibold uppercase tracking-wide border-t mt-1 pt-1">Move to main category</div>
          {hierarchy?.mainCategories.map(mc => (
            <button
              key={mc.id}
              onClick={() => handleMoveSubToMain(mc.id)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
            >
              {mc.label}
            </button>
          ))}
          <button
            onClick={handleMoveSubToNewMain}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-blue-600"
          >
            + New main category…
          </button>
        </>
      )}
    </div>
  )}

  {/* Inline rename overlay — positioned near the clicked label */}
  {renameTarget && (
    <div className="fixed inset-0 z-40" onClick={() => setRenameTarget(null)}>
      <div
        className="absolute bg-white border border-blue-400 rounded shadow-lg p-2"
        style={{ left: renameTarget.x, top: renameTarget.y + 4 }}
        onClick={e => e.stopPropagation()}
      >
        <input
          autoFocus
          defaultValue={renameTarget.label}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
          onKeyDown={e => {
            if (e.key === 'Enter') saveRename((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setRenameTarget(null)
          }}
        />
        <div className="text-xs text-gray-400 mt-1">Enter to save · Esc to cancel</div>
      </div>
    </div>
  )}
  ```

- [ ] **Step 10: Update table column headers**

  Replace the existing `<thead>` with:
  ```tsx
  <thead>
    <tr className="bg-gray-50 border-b border-gray-200">
      <th className="pl-3 pr-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Topic / Category</th>
      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Est. Traffic/mo</th>
      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Keywords</th>
      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Most Shown</th>
      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Highest Rank</th>
      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Brief</th>
      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Report</th>
    </tr>
  </thead>
  ```

- [ ] **Step 11: Build check**

  ```bash
  npx electron-vite build 2>&1 | tail -30
  ```
  Expected: no TypeScript errors.

- [ ] **Step 12: In-app smoke test**

  Launch the app (`npm run dev`):
  1. Open a project with processed keywords
  2. Navigate to Topics view
  3. If Gemini key is configured: verify main category rows (navy), sub-category rows (blue), topic rows (white) render
  4. Click a main category chevron → sub-categories collapse/expand
  5. Click a sub-category chevron → topics collapse/expand
  6. Drag a topic row and drop it on a different sub-category → topic moves
  7. Drag a sub-category header and drop on a different main category → sub-category moves
  8. Right-click a topic → context menu shows "Rename", "Move to…" with sub-category list
  9. Click Brief on a topic row → brief modal appears (same as before)
  10. Click Brief on a sub-category row → brief modal appears
  11. Click Report on a main category → HTML report opens (filtered to that category's topics)
  12. Verify "Uncategorised" bucket appears when Gemini key is absent

- [ ] **Step 13: Commit**

  ```bash
  git add src/renderer/src/views/TopicsView.tsx
  git commit -m "feat: refactor TopicsView to render CategoryHierarchy with DnD and context menu"
  ```

---

## Verification Checklist

- [ ] Schema migration v12 runs without error on both new and existing projects
- [ ] `clearTopics()` and `clearProjectData()` complete without FK constraint errors
- [ ] Running clustering in a project with a Gemini key produces main/sub category rows in the Topics view
- [ ] Running clustering without a Gemini key shows all topics in the "Uncategorised" bucket
- [ ] Drag a topic to a different sub-category → persists after page refresh
- [ ] Drag a sub-category to a different main category → persists after page refresh
- [ ] Right-click → "Move to new sub-category…" → sub-category created, rename input focused
- [ ] Rename a main category → label updated in DB and UI
- [ ] Brief button on a topic opens the brief modal
- [ ] Brief button on a sub-category opens a brief modal
- [ ] Brief button on a main category opens a brief modal
- [ ] Report button on a sub-category generates a filtered HTML report
- [ ] Report button on a main category generates a filtered HTML report
- [ ] Full Project Report (toolbar) still generates an unfiltered report covering all topics
- [ ] `topics:updated` event causes the hierarchy to refresh after auto-recluster
