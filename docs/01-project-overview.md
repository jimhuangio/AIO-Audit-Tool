# Project Overview — Fanout SEO

## What We're Building

**Fanout** is a desktop SEO research tool purpose-built for the AI Overview era. It automates the most time-consuming parts of AIO (AI Overview) analysis: discovering which URLs Google cites inside AI answers, at what position, for how many related queries — and then crawling those URLs to find exactly which paragraph or heading earned the citation.

Think of it as **Screaming Frog meets an AIO citation tracker**, running entirely on your local machine with your data stored in a single portable file.

---

## The Problem It Solves

Google's AI Overviews now appear for ~50% of informational queries. Traditional SEO tools show you:
- Organic rank position
- Click-through rates

But they **cannot** answer:
- Which domains appear as AIO source #1 vs #3 vs #7 across 10,000 keywords?
- Which page section (heading, paragraph) triggered a citation?
- How does AIO source dominance shift across topic clusters?
- When I do recursive "People Also Ask" lookups, what new keyword universe opens up?

Fanout answers all of these.

---

## Target Audience

| Persona | Use Case |
|---------|----------|
| **Senior Technical SEOs** | Mass AIO citation audits, competitive gap analysis |
| **SEO Agencies** | Client deliverables: "your competitor owns position 1 AIO for 34% of your target queries" |
| **Content Strategists** | Understand what page structures earn AIO citations |
| **In-house SEO teams** | Monitor brand's AI visibility score over time |

**Primary user:** Senior technical SEO with 10+ years experience, comfortable with CSV exports and data-heavy tables. Not a developer but not afraid of configuration.

---

## Core Functionality

### 1. Mass Keyword Input
- Paste keywords directly or upload CSV
- Automatic deduplication across the entire project
- Progress queue: see which keywords are pending / running / done / errored

### 2. AI Overview Data Harvesting
Pulls three types of data per keyword via DataForSEO:

| Data Type | What We Capture |
|-----------|----------------|
| **AIO** (AI Overview) | Text summary + cited sources at positions 1–10 |
| **AI Mode SERP** | AI Mode sources + follow-up query suggestions |
| **PAA** (People Also Ask) | Questions + AI-generated answers per question |

### 3. Fan-Out Discovery
- User sets depth (1 = just input keywords, 2 = + their PAA/follow-ups, 3 = recursive)
- Each keyword's PAA questions and AI Mode follow-ups become new keywords at depth+1
- Global deduplication: a keyword discovered multiple times is fetched only once
- Per-level child cap prevents runaway growth

### 4. AIO Position Analysis (Killer Feature)
Across all harvested keywords, for positions 1–10 in AIO source lists:
- Which domains appear most at each position?
- What is each domain's weighted AI Visibility Score (pos1=10pts, pos2=9pts, ...)?
- Toggle: aggregate by root domain (bankrate.com) or full subdomain (creditcards.bankrate.com)
- Export to CSV for client presentations

### 5. URL Crawler + Snippet Matching
- Crawls each cited URL once (cached)
- Direct fetch first via `undici`; Firecrawl cloud JS-render fallback for JavaScript-heavy pages (YouTube, social platforms) and bot-blocked responses
- Extracts: title, H1–H6, paragraphs, list items
- Matches AIO snippet text → most likely source section using TF-IDF + Jaccard similarity
- Answers: "Google cited paragraph 3 under H2 'How to Compare Cards'"

### 6. Topic Clustering
- Groups all keywords (including singletons that don't cluster with others) by overlapping cited domains + AIO text similarity
- Per-topic report: which domains dominate, highest-ranking domain per topic, most frequently cited domain per topic
- Useful for: "these 340 keywords are all in the 'credit card rewards' cluster; Nerdwallet owns it"

### 7. Multi-Domain Keyword Comparison
- Add one or more competitor domains to the Keywords view
- Each domain gets its own column showing its AIO position badge for that keyword
- Live autocomplete domain suggestions as you type (Google-style)
- Compare your domain vs. 3 competitors at a glance across all keywords

### 8. Project File System
- One `.aio-project.db` SQLite file per project
- Open, close, share like a spreadsheet
- No server, no cloud, no subscription database

---

## What Success Looks Like

A user loads 5,000 credit card keywords, sets fan-out depth 2, hits Run.

Two hours later they have:
1. A heatmap of which domains dominate AIO positions 1–10 across 15,000+ total keywords (with recursive discovery)
2. Per-keyword detail: "for 'best cashback card', Nerdwallet holds pos 1 and the cited section is their H2 'Our Top Picks'"
3. Topic clusters: 8 clusters identified, with the "travel rewards" cluster dominated by The Points Guy (38% of AIO citations)
4. A CSV they can paste into a client deck in 30 seconds

---

## Key Non-Goals

- **Not a rank tracker** — we don't track organic positions over time (separate tool for that)
- **Not a cloud SaaS** — intentionally local-first, no user accounts, no shared databases
- **Not a content writer** — we identify citation opportunities, not generate content
- **Not real-time** — data is harvested in batch, not live

---

## Constraints & Dependencies

| Item | Detail |
|------|--------|
| DataForSEO account required | API key stored globally in `userData/api-credentials.json`; Clear button removes it |
| Firecrawl (optional) | Cloud JS-render fallback for JS-heavy pages; API key stored in same credentials store |
| API costs | ~$0.003 per SERP task; 5,000 keywords × 3 task types = ~$45 |
| Rate limits | DataForSEO: 2,000 tasks/min; app throttles to 500/min default |
| OS | macOS + Windows (Electron cross-platform build); Linux possible |
| No cloud | All data local; user responsible for backups |

---

*← [Index](./00-INDEX.md) | Next: [MVP Definition](./02-mvp.md) →*
