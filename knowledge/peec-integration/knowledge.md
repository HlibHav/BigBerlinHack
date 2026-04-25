# Peec integration — knowledge

> Факти про Peec.ai в контексті BBH. Updated 2026-04-25 rev2 — Peec MCP-only access via Claude Code (no REST API for Challenge participants); demo brand = Attio.

## Access mode (2026-04-25 rev2 — confirmed via docs.peec.ai/mcp)

- **2026-04-25:** MCP Challenge participants get **MCP-only access** (browser OAuth via Claude Code), не REST API key. REST API (`https://api.peec.ai/customer/v1/*` з `x-api-key`) — Enterprise tier custom pricing, не у Challenge. Source: docs.peec.ai/mcp/setup + docs.peec.ai/api/authentication.md.
- **2026-04-25:** Peec MCP endpoint: `https://api.peec.ai/mcp` (Streamable HTTP transport, OAuth 2.0 auth).
- **2026-04-25:** Tools available via MCP (per docs.peec.ai/mcp/tools.md): `list_projects`, `list_brands`, `get_brand_report(project_id, start_date, end_date)`, `get_domain_report`, `get_url_report`, `get_url_content`, `list_prompts`, `list_chats`, `get_chat`, `list_models`, `list_topics`, `list_tags`, `list_search_queries`, `list_shopping_queries`, `get_actions(project_id, start_date, end_date, scope)`, plus write tools (`create_brand`, `create_prompt`, etc.) gated by company-owner role.
- **2026-04-25:** `get_brand_report` повертає columns: `[brand_id, brand_name, visibility, mention_count, share_of_voice, sentiment, position]` rows + total. **Sentiment + position native** — no own classifier needed для Peec-sourced signals.
- **2026-04-25:** Server-side code (Inngest functions у Vercel cron) **не може OAuth'итись** — no browser. Тому BBH стратегія: pull data manually у Claude Code session → persist у `data/peec-snapshot.json` → server reads JSON. Per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`.

## Demo brand (2026-04-25 rev2 — pivot to Attio)

- **2026-04-25:** Demo brand = **Attio (vs Salesforce + HubSpot)** — одна з 3 готових Peec MCP Challenge test projects (інші: Nothing Phone vs Apple/Samsung; BYD vs Tesla/Legacy automakers).
- **2026-04-25:** Attio = "modern flexible CRM for teams that hate traditional CRMs". B2B SaaS positioning близьке до нашого CMO/marketer audience.
- **2026-04-25:** Peec test project містить готові: brands (Attio + Salesforce + HubSpot), tracked prompts, 7+ днів historical brand reports з visibility/sentiment/position data, citation tracking via `get_url_report`.
- **2026-04-25:** Попередній demo brand "BBH self-promo" superseded бо нашого власного brand'у немає у Peec test projects, і MCP access через Challenge обмежений готовими projects.

## Pricing & access (2026-04-25 — confirmed via web research)

## Pricing & access (2026-04-25 — confirmed via web research)

- **2026-04-25:** Peec має 7-day free trial, далі **paid plans тільки**. No free tier. Source: peec.ai/pricing.
- **2026-04-25:** Brand pricing tiers: Starter €85/mo (50 prompts, 3 LLMs, 1 project, daily refresh), Pro €205/mo (150 prompts, 3 LLMs, 2 projects, multi-country 3 countries), Advanced €425/mo, Enterprise (custom).
- **2026-04-25:** Agency pricing tiers: Essential €205/mo (~111 prompts, 3 projects), Growth €425/mo (~277 prompts, 10 projects), Scale €675/mo (~722 prompts, 25 projects).
- **2026-04-25:** **API access — Enterprise tier тільки** (custom pricing). Source: peec.ai/pricing.
- **2026-04-25:** **Native Peec MCP available on ALL paid plans** (no Enterprise gate). Different from API access. Source: peec.ai/blog/peec-ai-mcp.

## Tracked LLMs

- **2026-04-25:** 6 base models tracked: ChatGPT, Perplexity, Gemini, Microsoft Copilot, Google AI Mode, Google AI Overviews. Source: peec.ai marketing.
- **2026-04-25:** Base plans only include **3 of choice** (за tier). Inclusion of all 6 — Enterprise.
- **2026-04-25:** Claude / DeepSeek / Grok — paid add-ons €30-140/mo each. Source: peec.ai/pricing.

## Metrics surfaces (це чим Peec відрізняється від плоскої snapshot tracking)

- **2026-04-25:** Three core metrics: (1) **Visibility** (mention rate / share-of-voice across LLMs), (2) **Position** (де brand ranked у lists), (3) **Sentiment** (positive/neutral/negative descriptions). Source: discoveredlabs.com Peec review + rankability.com Peec review.
- **2026-04-25:** **Citation source tracking** — Peec shows which specific sources AI systems cite when answering prompts. PR strategy data. Source: aipeekaboo.com Peec review.
- **2026-04-25:** Multi-country tracking on Pro+ tiers (3 countries per project Pro, more on higher tiers).

## Integration shapes

- **2026-04-25:** Native Peec MCP server connects to Claude/Cursor/n8n. Live data layer over Peec metrics. Source: peec.ai/blog/peec-ai-mcp.
- **2026-04-25:** Community-built MCP server `mcp-server-peecai` (GitHub thein-art/mcp-server-peecai) — 31 tools covering analytics reports, domain analysis, chat inspection, full CRUD. Alternative path якщо native MCP insufficient.
- **2026-04-25:** Looker Studio native export для reporting integrations.

## Hackathon status (2026-04-25 rev2 — MCP snapshot via Claude Code)

- **2026-04-25 morning:** Per `decisions/2026-04-25-hackathon-scope-cut.md`, Peec drop'нутий з scope через assumed paid tier complexity.
- **2026-04-25 evening — REVERSED:** Per `decisions/2026-04-25-peec-overlay-pivot.md`, Peec REACTIVATED як **PRIMARY data source**. Trigger — discovery of **Peec MCP Challenge** program.
- **2026-04-25 later evening — REVISED AGAIN:** Per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`, Peec access виявився **MCP-only через browser OAuth** (no REST API key для Challenge). Server-side не може OAuth'итись → strategy: pull data via Claude Code session, persist у `data/peec-snapshot.json`, Inngest reads JSON. **Demo brand pivot з BBH self-promo на Attio.**
- **2026-04-25:** BBH repositioned as **intelligence layer над Peec MCP**. Peec надає visibility/position/sentiment/citations natively across 8 LLMs (ChatGPT, Perplexity, Gemini, Google AI Overviews, Google AI Mode, Claude, Microsoft Copilot, Grok). BBH adds: severity classification, counter-draft generation, simulator (W5), multi-channel expansion (W7), Slack morning brief (W6′), approval workflow.
- **2026-04-25:** Demo brand = **Attio** (vs Salesforce + HubSpot). Уже-готовий Peec test project, доступний усім MCP Challenge participants.

## Was vs is

- (was 2026-04-24: hypothesis "free tier ~500 req/day" — DISPROVEN 2026-04-25 by web research. Actual: paid only, €85/mo entry).
- (was 2026-04-24: assumed standard API integration via `lib/mcp/peec.ts` — REVISED 2026-04-25. API = Enterprise. MCP = paid plan. Use native Peec MCP, не custom API wrapper).
- (was: "plugin-runtime MCP call" — superseded 2026-04-24 з переходом на webapp).
