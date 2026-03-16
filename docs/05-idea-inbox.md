# Idea Inbox — Fanout SEO

> Raw, unvetted ideas. No commitment implied. Review periodically and promote to Roadmap or discard.
> Format: **Idea** | Effort (S/M/L/XL) | Value (Low/Med/High) | Status (Raw/Exploring/Rejected)

---

## AI Visibility Monitoring (Trending)

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| Re-run keywords on a schedule and track AIO position changes over time | M | High | Exploring |
| "Your AI Visibility Score dropped 12 points this week" alert | S | High | Raw |
| Diff view: which domains entered/exited AIO citations since last run | M | High | Raw |
| Historical sparklines in position table | S | Med | Raw |

**Notes:** Would require storing run timestamps and treating each run as a snapshot. Add `run_id` to `aio_sources` table. Worth designing for from the start even if not implemented in MVP.

---

## Content Gap Analysis

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| "You rank organically but are NOT in AIO" detection | S | High | Raw |
| "Your competitor is cited at pos 1 for 80% of your target keywords" summary | S | High | Raw |
| Gap heatmap: keywords where you have zero AIO presence | S | High | Raw |
| Suggest which page to update to target missed AIO positions | L | Med | Raw |

---

## Crawler Enhancements

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| JavaScript rendering for SPAs via Firecrawl cloud API | M | Med | ✅ Implemented — fallback for JS-only/empty pages |
| crawl4ai integration as primary crawler (see [crawler research doc](./08-crawler-research.md)) | M | High | Exploring |
| Structured data extraction (JSON-LD, Schema.org types) | S | Med | Raw |
| Word count + reading level per page section | S | Low | Raw |
| Screenshot of matched section (Playwright) | M | Low | Raw |
| Detect if page has recently changed (ETag/Last-Modified) | S | Med | Raw |
| Extract author + publish date from article structured data | S | Med | Raw |

---

## Competitive Intelligence

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| Input: "my domain" → flag every keyword where competitor beats you in AIO | S | High | Raw |
| "Domain focus" mode: see ALL keywords where domain X appears in any AIO position | S | High | Raw |
| Export: "competitor AIO defense report" (where they appear, what content earns it) | M | High | Raw |
| Side-by-side: your AIO source sections vs competitor's for same keyword | L | Med | Raw |

---

## User Experience

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| Quick-add keywords from keyword detail view ("add to run queue") | S | Med | Raw |
| Annotation system: add notes to any keyword or topic | S | Med | Raw |
| Shared project mode: read-only URL to share results with client | XL | High | Raw |
| Preset location profiles (US desktop, UK mobile, AU desktop) | S | Med | Raw |
| Keyword priority tiers (High/Med/Low) with run order control | S | Med | Raw |
| Bulk-assign keywords to topic manually | S | Med | Raw |

---

## Integrations

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| Google Search Console import (pull your actual queries) | L | High | Exploring |
| Ahrefs/SEMrush keyword list import (CSV format normalization) | S | Med | Raw |
| Notion export (structured tables) | M | Low | Raw |
| Google Sheets live sync (via API) | L | Med | Raw |
| Slack alert when run completes | S | Med | Raw |
| DataForSEO Rank Tracker integration (pull existing tracked keywords) | M | High | Raw |

---

## AI-Powered Features (Claude API)

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| Auto-summarize AIO text for a topic cluster ("this topic is about...") | S | Med | Exploring |
| "Why is this domain cited?" explanation based on matched page sections | M | Med | Raw |
| Content brief generator: "to earn AIO citation for this keyword, cover these sections" | L | High | Raw |
| Cluster label generation (instead of n-gram heuristics) | S | Med | Raw |
| Anomaly detection: "this keyword cluster has unusual domain diversity" | M | Med | Raw |

**Note:** Claude API integration would use `claude-sonnet-4-6` or `claude-haiku-4-5` depending on task complexity and cost sensitivity. See the Claude API skill for implementation patterns.

---

## Data Export & Reporting

| Idea | Effort | Value | Status |
|------|--------|-------|--------|
| PowerPoint/PPTX export (client-ready slides) | L | High | Raw |
| PDF report generator | M | High | Raw |
| Embed-ready iframe (share position heatmap as live link) | XL | Med | Rejected — conflicts with offline-first |
| "Executive summary" view (auto-generated 1-pager) | M | High | Raw |
| Looker Studio connector (BigQuery export) | L | Med | Raw |

---

## Competitive Landscape (Research — March 2026)

**Finding:** No direct competitor provides AIO citation position tracking in a local-first desktop app.

| Tool | What They Do | Gap Fanout Fills |
|------|-------------|-----------------|
| **Semrush AI Toolkit** | AIO presence detection (yes/no), no position data | No position 1–10 breakdown, cloud SaaS, no snippet matching |
| **Ahrefs** | Tracks AIO appearances, domain-level | No per-position dominance, no snippet → section mapping |
| **BrightEdge / Conductor** | Enterprise AIO monitoring | Cloud-only, enterprise pricing, no local file |
| **SE Ranking** | AIO checker | No citation position analysis, no topic clustering |
| **Screaming Frog** | Crawler (no AIO) | No SERP data, no AI citation tracking |
| **Surfer SEO / Clearscope** | Content optimization | No AIO position data |

**Fanout's differentiated position:**
- Only tool with position 1–10 AIO citation heatmap across mass keyword sets
- Snippet → page section matching (which paragraph earned the citation) is unique
- Local-first `.db` file = no SaaS pricing, full data portability
- Fan-out discovery (recursive PAA expansion) builds keyword universe automatically

**Suggested next steps (from research):**
1. **Traffic metrics integration** — DataForSEO has Rank Tracker + Labs APIs for organic traffic estimates; would add "traffic at stake" context to AIO position data
2. **Windows build** — most SEO agencies run Windows; GitHub Actions CI for cross-platform builds
3. **App auto-updater** — electron-updater + GitHub releases for easy distribution
4. **First-run onboarding** — guided wizard: enter API key → test → add keywords → run

---

## Rejected Ideas

| Idea | Reason |
|------|--------|
| Real-time monitoring (live SERP checking every hour) | Conflicts with offline-first; DataForSEO costs would be unreasonable |
| Multi-user collaboration on same project | SQLite is single-writer; would require PostgreSQL migration |
| Browser extension version | Can't run MCP server in extension sandbox |
| Chrome DevTools integration | Too narrow audience |

---

## Promote to Roadmap Process

1. Move idea from this doc to the relevant Phase in `03-roadmap.md`
2. Add specific tasks (not just the idea)
3. Update status here to "Promoted → Phase N"
4. Remove from inbox after 2+ sprints

---

*← [Architecture](./04-architecture.md) | Next: [Debugging & Planning Guide](./07-debugging-planning.md) →*
