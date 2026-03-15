# Skills & Tools Registry — Fanout SEO

> External tools, Claude Code skills, and MCP servers that accelerate development of this project.

---

## Claude Code Skills

Skills are workflow templates you invoke with `/skill-name` inside Claude Code. They automate repeatable development patterns.

### Skills Directly Useful for Fanout

| Skill | Command | Use Case |
|-------|---------|----------|
| **simplify** | `/simplify` | After writing a new module, review it for over-engineering and clean up |
| **commit** | `/commit` | Generate a well-structured commit message for staged changes |
| **review-pr** | `/review-pr [number]` | Review a GitHub PR before merging |
| **claude-api** | (auto-triggered) | When integrating Claude API for topic labeling or content brief generation |
| **loop** | `/loop 5m /check-status` | Poll a long-running API task or build process every N minutes |

### Skill Collections to Explore

#### [awesome-claude-skills (Composio)](https://github.com/ComposioHQ/awesome-claude-skills)
**What it is:** 100+ Claude Skills covering document processing, dev tools, data analysis, and business automation. Integrates with 500+ apps via Composio (Slack, GitHub, Notion, Google Sheets).

**Useful for Fanout:**
- GitHub issue/PR creation from within Claude Code
- Slack notification when a long run completes
- Google Sheets export (alternative to CSV)
- Notion page generation for client deliverables

**Install:** Browse the repo and copy individual skill files to `~/.claude/skills/`

---

#### [superpowers (obra)](https://github.com/obra/superpowers)
**What it is:** A complete software development workflow for AI coding agents. Provides composable skills that automate the full cycle: brainstorming → planning → TDD → code review. Designed for autonomous agent operation over extended periods.

**Useful for Fanout:**
- `/superpowers:plan` — Generate a structured implementation plan before starting a complex feature
- `/superpowers:tdd` — Write tests before implementation (useful for the SQL query layer)
- `/superpowers:review` — Automated code review after writing a new module

**Best practice:** Use superpowers planning skills before implementing Phase 3 (crawler) to prevent scope creep.

---

#### [everything-claude-code (affaan-m)](https://github.com/affaan-m/everything-claude-code)
**What it is:** Performance optimization plugin for Claude Code. Provides 16 specialized agents, 65+ skills, 40+ slash commands, and configurable rules. Focuses on token efficiency, continuous learning, and verification loops.

**Useful for Fanout:**
- Specialized agents for TypeScript, SQL, and Electron development contexts
- Verification loops to check that generated code matches the IPC contract
- Token optimization for long Claude Code sessions (prevents context rot)

---

#### [get-shit-done (gsd-build)](https://github.com/gsd-build/get-shit-done)
**What it is:** Meta-prompting and context engineering system. Breaks projects into atomic tasks with fresh context windows, preventing "context rot." Commands: `/gsd:new-project`, `/gsd:execute-phase`.

**Useful for Fanout:**
- `/gsd:new-project` — Bootstrap Phase 2 implementation with structured context
- `/gsd:execute-phase` — Run a complete implementation phase (e.g., "implement the fan-out worker") in coordinated parallel waves
- Solves the problem of Claude forgetting constraints after many exchanges

**Recommended workflow:**
```
1. Write the phase spec in 03-roadmap.md (done)
2. Run /gsd:new-project with the spec as input
3. Let GSD break it into atomic implementation tasks
4. Execute tasks with /gsd:execute-phase
5. Each task runs in a fresh context with only the relevant constraints
```

---

## MCP Servers

Model Context Protocol servers extend Claude Code with real-world tool access.

### Configured for This Project

| MCP Server | Purpose | Status |
|------------|---------|--------|
| **DataForSEO MCP** | SERP data, AIO sources, PAA | Required for all harvesting |
| **Supabase MCP** | Available (not used in local-first architecture) | Available if cloud sync added |
| **RevenueCat MCP** | Available (if monetizing the app) | Future |

### DataForSEO MCP Setup

```bash
# Option A: npx (no Docker, recommended for development)
npx -y @dataforseo/mcp-server

# Option B: docker-compose
version: "3.9"
services:
  dataforseo-mcp:
    image: dataforseo/mcp-server:latest
    environment:
      DATAFORSEO_LOGIN:    ${DFS_LOGIN}
      DATAFORSEO_PASSWORD: ${DFS_PASSWORD}
      MCP_TRANSPORT:       stdio

# Add to Claude Code MCP config (~/.claude/mcp.json):
{
  "mcpServers": {
    "dataforseo": {
      "command": "npx",
      "args": ["-y", "@dataforseo/mcp-server"],
      "env": {
        "DATAFORSEO_LOGIN": "your@email.com",
        "DATAFORSEO_PASSWORD": "your_password"
      }
    }
  }
}
```

### MCP Tools Available (DataForSEO)

| Tool | Used For |
|------|----------|
| `dataforseo_google_serp_advanced` | AIO + PAA extraction |
| `dataforseo_ai_mode_serp` | AI Mode citations + follow-up queries |
| `dataforseo_google_keyword_data` | Search volume (future: enrich keyword table) |
| `dataforseo_backlinks` | Future: verify if crawled URLs have authority |

---

## Crawling Libraries

See the full evaluation in [08-crawler-research.md](./08-crawler-research.md).

| Library | Language | Role |
|---------|----------|------|
| `undici` | Node.js | Default fast crawler (Tier 1) |
| `cheerio` | Node.js | HTML parsing + section extraction |
| `crawl4ai` | Python | JS-capable fallback crawler (Tier 2) |
| `Scrapling` | Python | Anti-bot bypass (Tier 3, special cases) |

### crawl4ai Quick Reference

**GitHub:** `github.com/unclecode/crawl4ai`

```bash
pip install crawl4ai
python -m crawl4ai.server --port 11235  # start as HTTP sidecar

# Or via Docker
docker run -p 11235:11235 unclecode/crawl4ai:latest
```

**Key capability:** Produces clean Markdown with semantic structure preserved — headings become `##`, tables stay as tables, code blocks are fenced. This maps directly to our `page_sections` schema.

### Scrapling Quick Reference

**GitHub:** `github.com/D4Vinci/Scrapling`

```bash
pip install scrapling

# Stealth fetch (bypasses Cloudflare)
from scrapling.fetchers import StealthyFetcher
page = StealthyFetcher.fetch("https://blocked-site.com")
```

**Key capability:** Adaptive selectors that survive website redesigns. If a site changes its DOM structure, Scrapling's parser re-locates the same content automatically.

---

## Development Tools

### Required

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22 LTS | Runtime |
| electron-vite | latest | Build system |
| better-sqlite3 | 9.x | SQLite driver |
| BullMQ | 5.x | Job queue |
| Zustand | 5.x | State management |
| TanStack Table | 8.x | Virtual table |
| TanStack Query | 5.x | Query cache |
| Cheerio | 1.x | HTML parsing |
| undici | 6.x | HTTP client |
| shadcn/ui | latest | UI components |
| Tailwind | 4.x | Styling |

### Optional (Phase 3+)

| Tool | Purpose |
|------|---------|
| `p-queue` | Per-domain crawl rate limiting |
| `p-retry` | Configurable retry with backoff |
| `better-sqlite3-multiple-ciphers` | If we add project-level encryption |
| `electron-updater` | Auto-update (Phase 5) |
| `playwright` | Screenshot of matched sections (Phase 5) |

---

## Useful Reference Links

| Resource | URL |
|----------|-----|
| DataForSEO API Docs | `docs.dataforseo.com` |
| DataForSEO MCP GitHub | `github.com/dataforseo/mcp-server` |
| electron-vite docs | `electron-vite.org` |
| better-sqlite3 API | `github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md` |
| BullMQ docs | `docs.bullmq.io` |
| TanStack Table virtualizer | `tanstack.com/virtual/latest` |
| crawl4ai docs | `crawl4ai.com` |
| MCP specification | `modelcontextprotocol.io` |

---

## Skills Wishlist (Not Yet Found)

Skills we'd benefit from but haven't found:

- **SQLite schema reviewer** — validates schema against best practices, checks index coverage
- **Electron IPC type generator** — auto-generates contextBridge types from IPC handler signatures
- **DataForSEO payload builder** — generates valid request payloads for specific endpoints

If building custom skills, see the Claude Code skill authoring docs or browse `github.com/sickn33/antigravity-awesome-skills` for patterns.

---

*← [Customer Comms](./09-customer-comms.md) | Back to: [Index](./00-INDEX.md) →*
