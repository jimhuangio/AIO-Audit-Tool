# Competitive Research — GEO/AEO Tracker
> Source: https://github.com/danishashko/geo-aeo-tracker (Daniel Shashko, March 2026)
> Reviewed: March 2026

---

## What Is It?

GEO/AEO Tracker is an open-source, local-first AI visibility dashboard that tracks brand mentions across **6 AI models simultaneously** (ChatGPT, Perplexity, Gemini, Copilot, Google AI Overview, Grok). It uses Bright Data's AI Scraper API + OpenRouter for LLM inference.

It approaches the same problem space as Fanout from a different angle: where Fanout is a **mass keyword → AIO source analysis** tool, geo-aeo-tracker is a **brand visibility monitoring** tool. Both overlap on the "what content earns AI citations" question, but with different primary use cases.

---

## Feature Gap Analysis

### Features geo-aeo-tracker has that Fanout doesn't

| Feature | Their Approach | Fanout Gap |
|---------|---------------|------------|
| **Multi-model tracking** | ChatGPT, Perplexity, Gemini, Copilot, Grok via Bright Data scrapers | Fanout is Google AIO only — misses growing Perplexity/ChatGPT citation share |
| **SRO Score (0–100)** | 6-stage pipeline: Grounding → Cross-Platform Citations → SERP → Page Scraping → Site Context → LLM Analysis | No single "AI readiness score" per crawled URL |
| **AEO Site Audit** | Checks llms.txt presence, Schema.org coverage, BLUF density, heading structure | We crawl pages but don't surface readiness signals as actionable audit output |
| **BLUF Density** | "Bottom Line Up Front" — measures whether page leads with the direct answer AI models prefer | Not measured at all; directly affects AIO citation probability |
| **llms.txt Detection** | Flags if a domain has an `llms.txt` file (AI crawler instructions) | Not tracked |
| **Drift Alerts** | "Your visibility score dropped 12 points this week" — scheduled re-runs with delta comparison | No run-to-run comparison (in idea inbox as `run_id` concept) |
| **Citation Opportunities** | "Competitors get cited here, you don't" — with outreach brief generation | Fanout has multi-domain comparison but not this framing or the outreach angle |
| **Competitor Battlecards** | AI-generated side-by-side analysis: strengths, weaknesses, citation patterns | Fanout has domain heatmap but no narrative competitive summary |
| **Niche Explorer** | LLM-generated high-intent queries for your niche | Fanout does PAA recursive discovery but no LLM-driven query ideation |
| **Persona Fan-Out** | Prompt variants per persona (CMO, SEO Lead, Founder) — tests how AI responds to same topic for different audiences | No persona testing |
| **Visibility Score (5-factor)** | Brand mentions + position + frequency + citations + sentiment | Fanout score is purely position-weighted (Σ(11−position)), ignores sentiment and brand mention density |
| **Historical delta tracking** | Time-series line charts across runs with Recharts | No history (run_id idea is in inbox, not implemented) |
| **Multi-workspace** | Multiple brands/projects in one app | Fanout is one project per `.db` file |

### Where Fanout is stronger

| Fanout Capability | Why geo-aeo-tracker can't match it |
|-------------------|-------------------------------------|
| Mass keyword processing (10k–100k) | geo-aeo is prompt-based, not batch SERP analysis |
| Per-position AIO heatmap (1–10) | They track presence, not position breakdown |
| Page section matching (H2/paragraph that earned citation) | Unique to Fanout — they don't do source-level text matching |
| PAA recursive keyword discovery | They have "Niche Explorer" via LLM but no PAA-recursive fan-out |
| Organic rank alongside AIO | Not in geo-aeo-tracker |
| Local `.db` portability | They use IndexedDB (browser), less portable |

---

## Suggested Features / Improvements for Fanout

### Tier 1 — High Value, Builds on Existing Data

These use data Fanout already captures; just needs new presentation or light additions.

**1. AEO Readiness Score per Crawled URL**
Compute a 0–100 score from existing crawl data:
- Schema.org coverage (+20 pts if FAQPage/HowTo/Article present)
- H1/H2 heading structure quality (clear hierarchy)
- BLUF density: does the first `<p>` after an `<h2>` directly answer the heading? (estimate from section matching)
- `llms.txt` detected at `domain/llms.txt` (single HEAD request per domain, cache result)
- Content length signal (word count per section)

Surface this in the Crawler view as a badge next to each URL, and aggregate per domain in the domain heatmap.

**2. Citation Opportunity View**
Already have all the data needed. For each keyword where your domain (or a client domain) does NOT appear in AIO sources but a competitor does, surface it as an explicit opportunity row:
- "Competitor X is at AIO pos 1 for this keyword — you're absent"
- Link to the competitor's cited URL and the matched section
- Sort by search volume × AIO position weight = "opportunity score"

**3. BLUF Density Detection in Crawler**
During `extractPageContent()`, check whether each section that immediately follows a heading starts with a direct statement rather than a preamble. Simple heuristic: first sentence doesn't start with "In this article", "This guide will", "We will discuss", etc. Flag BLUF-compliant sections. Surfaces in crawler view and report.

**4. llms.txt Detection**
When crawling any URL, issue a `HEAD` request to `{scheme}://{domain}/llms.txt`. Cache per domain. Show badge in crawler domain list: "✓ llms.txt" or "✗". Include in AEO Readiness Score. Single HEAD request per domain = negligible cost.

**5. Enhanced Visibility Score (5 factors)**
Current score: `Σ(11 − position)` — position-weighted only.
Add three more signals from existing data:
- **Citation frequency**: how many keywords cite this domain (already computed as `totalAppearances`)
- **Position consistency**: does the domain appear at the same position across similar keywords? (low variance = signal of authoritative content)
- **Topic breadth**: how many distinct topic clusters cite this domain?

Revised formula would make the heatmap more meaningful for competitive analysis.

---

### Tier 2 — New Capabilities, Medium Effort

**6. Run History / Drift Tracking**
Add `run_id` column to `aio_sources` (already in idea inbox). Each run gets a UUID + timestamp. Enable:
- "Compare to previous run" showing which domains entered/exited AIO citations
- Per-domain position change delta (↑ 2 positions, ↓ 1 position)
- "AI Visibility Score changed +8 since last run" banner
- Historical sparklines on the domain heatmap

This is the single highest-value missing feature for agency use cases (client reporting over time).

**7. Competitor Battlecard Generator**
Using existing topic cluster data + multi-domain comparison:
- User selects "your domain" + up to 3 competitor domains
- Gemini generates a narrative summary: "NerdWallet dominates the 'credit card rewards' cluster at 34% of AIO citations. They appear at position 1 for 78% of high-volume transactional keywords. Key differentiator: their cited sections are consistently H2-led lists under 200 words."
- Output as a PDF section or inline card in the Topics view

**8. Perplexity / ChatGPT Citation Detection (Multi-Model)**
Extend DataForSEO integration or add Bright Data AI Scrapers for Perplexity (their AI Answer feature). For each keyword, check if a URL gets cited in Perplexity's answer in addition to Google AIO. Show an additional "Perplexity" column in the Keywords view alongside the existing AIO column.

Perplexity is now the most important non-Google AI citation source for SEOs — this would be a significant differentiator against all existing tools.

**9. Niche Explorer (LLM-Driven Query Expansion)**
Complement PAA recursive discovery with a Gemini-powered niche query generator:
- Takes topic cluster labels as input
- Returns 20–50 additional high-intent queries per cluster that PAA might not surface
- These are added to the keyword queue as a separate discovery batch
- Useful for finding queries where brand is absent from AIO before PAA discovers them

---

### Tier 3 — Larger Scope, High Strategic Value

**10. AEO Site Audit Module**
A dedicated audit view for any domain (yours or competitor's):
- Run when user enters a domain manually
- Crawl homepage + top 10 cited pages for that domain
- Score each page on: Schema.org types, heading hierarchy, BLUF density, llms.txt, content length
- Aggregate into domain-level score with prioritized fix list
- "If you fix these 3 things, your AEO readiness score improves from 42 → 71"

**11. Persona Fan-Out Prompts**
For each topic cluster, generate AI-query variants by persona:
- "I'm a CFO evaluating travel rewards cards" vs "I'm a frequent flyer" vs "I'm a small business owner"
- Submit each variant to Google AI Mode and capture which domains are cited per persona
- Reveals: "The Points Guy owns the frequent-flyer persona; NerdWallet owns the CFO persona"
- High value for content strategy: write for the persona that's weakest for your domain

---

## What geo-aeo-tracker Gets Right (Process Observations)

1. **SRO pipeline is the right framing** — "Search Result Optimization" is a better label than "AEO audit" for what Fanout's crawler already does. Consider adopting SRO as the vocabulary for the crawler + analysis workflow.

2. **Scoring everything to 0–100** — reduces cognitive load for non-technical users. A single score per domain, per topic, per page is more actionable than raw data. Fanout should expose more "what does this mean?" scoring.

3. **Citation Opportunities as a standalone tab** — they correctly identify that "here's where you're missing" is the highest-value output. Fanout buries this in the multi-domain comparison table. A dedicated view would surface the value better.

4. **Demo mode with seed data** — their demo mode (deterministic seed data, no API keys needed) is excellent for showing the tool to clients or prospects. Worth implementing for Fanout's onboarding flow.

---

## Priority Ranking for Fanout Backlog

| # | Feature | Effort | Value | Recommended Phase |
|---|---------|--------|-------|-------------------|
| 1 | Run History / Drift Tracking | M | High | Phase 5 or 6 |
| 2 | Citation Opportunity View | S | High | Phase 5 |
| 3 | AEO Readiness Score per URL | S | High | Phase 5 |
| 4 | llms.txt Detection | XS | Med | Phase 5 (quick win) |
| 5 | BLUF Density Detection | S | Med | Phase 5 |
| 6 | Enhanced Visibility Score | S | Med | Phase 5 |
| 7 | Competitor Battlecard Generator | M | High | Phase 6 |
| 8 | Perplexity Citation Detection | L | High | Phase 6 |
| 9 | Niche Explorer (LLM queries) | M | Med | Phase 6 |
| 10 | AEO Site Audit Module | L | High | Phase 7 |
| 11 | Persona Fan-Out | L | Med | Phase 7 |

---

*← [Skills & Tools Registry](./10-skills-tools.md)*
