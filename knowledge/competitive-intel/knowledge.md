# Competitive intel — knowledge

> Як працює competitor-radar, що рахується "move", що — шум.

## Signal sources

- **2026-04-24:** Competitor signals pull'аються з трьох джерел: Peec (LLM mentions), Tavily (web search), Firecrawl (direct scrape). Per-competitor `watch_sources` у BrandContext налаштовує що вмикати. Source: CONTRACTS.md §1.
- **2026-04-25 update:** Hackathon scope active sources: **Peec snapshot file** (`data/peec-snapshot.json`, refreshed manually via Claude Code MCP session per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`) + **Tavily** live web search. Firecrawl `[DEFERRED]` per scope cut (Tavily covers between Peec syncs). Was: live REST `lib/mcp/peec.ts` — superseded.

## Severity

- **2026-04-24:** Severity категорії: `low`, `med`, `high`. Визначається gravity (fundraise/new-product/exec-move = high; new-content/blog = med; minor-update = low). Source: SKILLS.md §4.

## Counter-draft policy

- **2026-04-24:** Auto-generated counter-drafts **тільки для** `severity=high`. Для `med` — лишаємо signal у state, drafт не генеруємо. Для `low` — тільки logged. Reasoning: cost + noise control. Source: SKILLS.md §4 (updated 2026-04-24).
- **2026-04-24:** Counter-drafts завжди `status: draft` на старті. Founder mustnu approve через manual edit frontmatter. Немає auto-publishing. Source: RUNBOOK.md.

## Severity threshold config

- **2026-04-24:** Per-competitor `severity_threshold` у config — визначає мінімум при якому signal взагалі зберігаємо. Source: CONTRACTS.md §1.
