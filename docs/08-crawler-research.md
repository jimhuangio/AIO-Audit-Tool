# Crawler Research — Fanout SEO

> Evaluating crawling tools for Phase 3: extracting page sections from AIO-cited URLs and matching them to AIO snippets.

---

## Requirements

The crawler in Fanout needs to:

1. Fetch HTML from 10k–100k unique URLs (cited in AIO sources)
2. Extract structured sections: title, H1–H6, paragraphs, list items
3. Handle anti-bot protection gracefully (many SEO/finance sites use Cloudflare)
4. Cache results in SQLite (crawl once, re-analyze many times)
5. Respect rate limits per domain
6. Run as a Node.js child process (Electron main process or sidecar)
7. Return structured data, not raw HTML (ideally)

---

## Tool Evaluation

### Option 1: `undici` (Node.js built-in HTTP) + Cheerio

**What it is:** `undici` is Node.js's official HTTP client (used internally by `fetch()`). Cheerio is a fast, jQuery-like HTML parser.

**Pros:**
- Zero additional dependencies beyond what we already need
- Fastest for simple HTML pages (no browser overhead)
- Full control over headers, timeouts, connection pooling
- Synchronous-friendly: parse HTML immediately after response

**Cons:**
- No JavaScript execution — SPAs return empty content
- No stealth mode — easily blocked by Cloudflare/bot protection
- Manual cookie handling for session-based sites

**Best for:** Static HTML pages (Wikipedia, most news/blog sites, documentation)

**Sample:**
```typescript
import { fetch } from "undici";
import * as cheerio from "cheerio";

const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; FanoutSEO/1.0 Research Bot)" },
  signal: AbortSignal.timeout(15_000),
});
const html = await res.text();
const $ = cheerio.load(html);
```

**Verdict:** ✅ Use as the default crawler (covers 70–80% of sites)

---

### Option 2: crawl4ai

**Repo:** `github.com/unclecode/crawl4ai`
**Language:** Python (requires Python sidecar from Electron)

**What it does:** An open-source web crawler/scraper specifically designed to produce AI-ready structured data. Key features:
- JavaScript execution via browser automation (Playwright under the hood)
- Outputs clean Markdown with headings, tables, code blocks, and citation hints
- LLM-driven structured extraction (can extract JSON schema from pages)
- Docker deployable or local Python process
- Adaptive intelligence for intelligent content selection

**Pros:**
- Output is **already structured Markdown** — maps perfectly to our page_sections table
- Handles SPAs and JS-heavy pages
- Built-in content filtering (removes nav, footer, boilerplate)
- LLM extraction mode could auto-identify "the main article content" vs. sidebars
- Active project (10k+ GitHub stars as of 2025)

**Cons:**
- Python — requires spawning a sidecar process from Electron
- Browser automation = slower and heavier (Chromium instance)
- LLM extraction costs tokens (OpenAI/Anthropic API calls)
- More complex to bundle with Electron app (Python runtime)

**Integration Pattern:**
```typescript
// Spawn crawl4ai as Python HTTP server sidecar
// src/main/crawler/crawl4ai-client.ts
import { spawn } from "child_process";

class Crawl4AIClient {
  private proc: ChildProcess;
  private baseUrl = "http://localhost:11235";

  async start() {
    this.proc = spawn("python", ["-m", "crawl4ai.server", "--port", "11235"]);
    await this.waitForReady();
  }

  async crawl(url: string): Promise<CrawlResult> {
    const res = await fetch(`${this.baseUrl}/crawl`, {
      method: "POST",
      body: JSON.stringify({ url, output_format: "markdown" }),
      headers: { "Content-Type": "application/json" },
    });
    return res.json();
  }
}
```

**Verdict:** ✅ Use as fallback for JS-heavy sites (Cloudflare-protected, SPA content)

---

### Option 3: Scrapling

**Repo:** `github.com/D4Vinci/Scrapling`
**Language:** Python

**What it does:** An adaptive web scraping framework handling everything from single requests to full-scale crawls. Key features:
- Multiple fetchers: plain HTTP, stealth mode (browser fingerprint spoofing), full browser automation
- Scrapy-like spider framework with concurrent crawling and pause/resume
- **Intelligent element relocation** — if a website restructures, Scrapling auto-adapts its selectors
- Anti-bot bypass built-in (stealth fetcher uses real browser fingerprints)

**Pros:**
- Best-in-class anti-bot bypass (stealth mode)
- Adaptive selectors survive website redesigns
- Pause/resume capability aligns with our job queue model
- Can handle Cloudflare-protected domains that block undici

**Cons:**
- Python — same sidecar overhead as crawl4ai
- More focused on scraping repeated structured data (e-commerce, listings) than one-off article extraction
- Less focus on clean content extraction (we'd still need Cheerio-equivalent parsing)

**Verdict:** 🔲 Evaluate for high-block-rate domains; likely overkill for Phase 3 MVP

---

## Recommended Crawling Strategy

### Tiered Crawler Architecture

```
URL to crawl
    │
    ▼
Tier 1: undici + Cheerio (fast, default)
    │
    ├── Success (200, has body) → extract sections → done
    │
    └── Failed (403, empty body, JS required)
            │
            ▼
        Tier 2: crawl4ai (Python sidecar, Playwright)
            │
            ├── Success → extract sections → done
            │
            └── Failed (Cloudflare wall, login required)
                    │
                    ▼
                Mark as crawl_blocked, skip gracefully
```

```typescript
// src/main/crawler/index.ts
async function crawlWithFallback(url: string): Promise<PageContent | null> {
  // Try fast path first
  try {
    const result = await crawlWithUndici(url);
    if (result.bodyLength > 500) return result;  // got real content
  } catch {}

  // Fall back to crawl4ai if available
  if (crawl4AIClient.isRunning()) {
    try {
      return await crawl4AIClient.crawl(url);
    } catch {}
  }

  return null;  // skip, mark as blocked
}
```

### Per-Domain Rate Limiting

```typescript
// Respect crawl delay per domain — SEO sites are watching
const domainQueues = new Map<string, PQueue>();

function getDomainQueue(domain: string): PQueue {
  if (!domainQueues.has(domain)) {
    domainQueues.set(domain, new PQueue({
      concurrency: 1,
      interval: 2000,    // 1 request per 2 seconds per domain
      intervalCap: 1,
    }));
  }
  return domainQueues.get(domain)!;
}

async function crawlRateLimited(url: string) {
  const domain = new URL(url).hostname;
  const queue  = getDomainQueue(domain);
  return queue.add(() => crawlWithFallback(url));
}
```

### Section Extraction (Cheerio)

```typescript
function extractSections(html: string): PageSection[] {
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, header, aside, .sidebar, .ads, [role='navigation']").remove();

  const sections: PageSection[] = [];
  let idx = 0;

  // Extract in document order to preserve context
  $("h1,h2,h3,h4,h5,h6,p,li,blockquote").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text.length < 20) return;  // skip micro-content

    sections.push({
      section_type: el.tagName.toLowerCase(),
      content: text,
      position_idx: idx++,
    });
  });

  return sections;
}
```

### Snippet Matching Algorithm

```
For each AIO citation (snippet + URL):
  1. Tokenize snippet (lowercase, remove stopwords)
  2. For each page section:
     a. Tokenize section content
     b. Jaccard(snippet_tokens, section_tokens) × 0.6
     c. tokenOverlap(snippet_tokens, section_tokens) × 0.35
     d. headingBonus = section_type.startsWith('h') ? 0.05 : 0
     e. score = a + b + c
  3. Store top 3 sections with score > 0.05
  4. Best match = highest score
```

**Why not embeddings?**
- Requires API call (OpenAI/Cohere) or local model per comparison
- TF-IDF + Jaccard is fast, deterministic, offline
- For AIO snippets that are often verbatim or near-verbatim from the page, Jaccard overlap is surprisingly effective
- Can add embedding refinement in Phase 4 as an opt-in enhancement

---

## Bundling Strategy for Electron

```
Phase 3 MVP: undici only (no Python required)
  → Ship immediately, handles ~75% of cited URLs

Phase 3 Enhanced: Add crawl4ai as optional sidecar
  → User installs Python separately OR we bundle minimal Python runtime
  → App detects: if (await checkPythonAvailable()) { enableCrawl4AI(); }

Phase 4: Bundle Pyodide (Python in WebAssembly)
  → No external Python install
  → ~10MB additional bundle
  → Enables crawl4ai in-process
```

---

## crawl4ai vs Scrapling — Decision Matrix

| Factor | crawl4ai | Scrapling |
|--------|----------|-----------|
| Output format | Clean Markdown ✅ | Raw DOM access |
| AI/LLM integration | Built-in ✅ | Manual |
| Anti-bot bypass | Playwright-based | Stealth mode ✅ |
| Content extraction | Excellent ✅ | Good |
| Resume/pause | No | Yes ✅ |
| Node.js integration | HTTP server | HTTP server |
| Active development | Very active ✅ | Active |
| Best for our use case | ✅ Content extraction | Structured scraping |

**Final recommendation:**
- **Default:** undici + Cheerio (built-in, no Python)
- **Phase 3 fallback:** crawl4ai (content extraction, Markdown output)
- **Special cases:** Scrapling if specific domains resist crawl4ai

---

*← [Debugging Guide](./07-debugging-planning.md) | Next: [Customer Comms](./09-customer-comms.md) →*
