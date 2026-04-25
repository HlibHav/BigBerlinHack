# Architecture — knowledge (established facts)

> Усталені факти про архітектуру BBH. Те на що можна спиратись.

## System shape

- **2026-04-24:** brand-intel = Next.js 14 webapp на Vercel. Runtime = один, обслуговує N брендів через колонку `organization_id` у Supabase. Source: ADR-001-R (decisions/2026-04-24-deployment-webapp.md), ADR-005. (was: Claude Code plugin з `config/{brand}.yaml` і `state/{brand}/` файловою структурою — superseded 2026-04-24 бо plugin не дає public URL/embed/webhook для hackathon).
- **2026-04-24:** Weight-bearing components: 4 Inngest functions (`morningBriefSchedule`, `competitorRadarSchedule`, `narrativeSimulator`, `widgetRegenerate`) + Next.js routes (`/demo/[brand]`, `/widget/[brand]`, `/api/webhooks/*`) + Supabase як state. Source: decisions/2026-04-24-deployment-webapp.md + 2026-04-24-scheduling-inngest.md.
- **2026-04-24:** State layer = Supabase Postgres + pgvector. Кожна таблиця має `organization_id` + RLS policy. Embeddings на snapshots/citations/signals для similarity. Source: ADR-002-R (decisions/2026-04-24-storage-supabase-pgvector.md). (was: file-based JSON/JSONL/Markdown у `state/{brand}/` — superseded 2026-04-24 бо serverless не має shared disk і widget SSR потребує <100ms queries).

## Concurrency

- **2026-04-24:** Concurrency обслуговується Inngest step idempotency (event key = `${brand_id}:${run_window}`) + Postgres row-level locking для critical updates. Жодних pid-lock файлів. Source: ADR-004-R (decisions/2026-04-24-scheduling-inngest.md). (was: per-brand pid-lock `state/{brand}/.lock` — superseded бо serverless не має persistent FS).

## Scheduling

- **2026-04-24:** Scheduling через Inngest cron functions (`0 8 * * *` для morning-brief, `0 */6 * * *` для competitor-radar). Catch-up автоматичний при missed window. Webhook events (Telli callback) через Next.js route handler → Inngest event emit. Source: ADR-004-R. (was: `scheduled-tasks` MCP з catch-up on first open — superseded 2026-04-24, MCP plugin-only).
- **2026-04-24:** "Since last run" logic — при catch-up один run покриває missed інтервал. Реалізується через query `SELECT max(run_window_start) FROM runs WHERE organization_id = ...` перед fetch. Source: 2026-04-24-scheduling-inngest.md implementation note.

## Subagents / Inngest steps

- **2026-04-24:** Окремий Inngest function (vs inline step) spawn'ається тільки коли: (a) паралельне виконання, (b) parent context інакше забруднюється великим обсягом даних, (c) self-contained contract + potential reuse. Дефолт — inline `step.run(...)`. Source: ADR-003 (stays valid after pivot).

## Runtime externals

- **2026-04-24:** MCP clients для external APIs (full design):
  - Peec (brand monitoring / GEO)
  - Tavily (web search fallback)
  - Firecrawl (deep scrape)
  - Telli (voice-agent outbound calls + webhook callbacks)
  - ElevenLabs (TTS fallback chain)
  - OpenAI або Anthropic (LLM + embeddings)
  Source: `brand-intel/ARCHITECTURE.md §7 MCP wrappers` + decisions/2026-04-24-voice-agent-telli.md.
- **2026-04-25 update (hackathon-active subset):** Per `decisions/2026-04-25-mcp-only-peec-attio-demo.md` + `decisions/2026-04-25-hackathon-scope-cut.md`:
  - Peec → snapshot file `data/peec-snapshot.json` (refreshed manually via Claude Code MCP session, NOT live REST). Loader at `lib/services/peec-snapshot.ts`.
  - Tavily → live HTTP via `lib/services/tavily.ts`.
  - OpenAI / Anthropic → LLM + embeddings.
  - Slack incoming webhook → W6′ delivery.
  - Firecrawl, Telli, ElevenLabs, Resend → `[DEFERRED]` post-hackathon.

## Auth / multi-tenancy

- **2026-04-24:** Hackathon demo exposes `/demo/{DEMO_BRAND_ID}` без auth через окрему RLS policy `"*_public_demo"`. Решта брендів — Supabase Auth + `get_user_org_id()` helper. Source: decisions/2026-04-24-deployment-webapp.md (Auth section) + 2026-04-24-storage-supabase-pgvector.md.

## Evidence chain

- **2026-04-24:** Усі agent-generated артефакти (snapshots, signals, counter-drafts, narratives) мають `evidence_refs: string[]` (≥1). Zod schema `.min(1)` enforce на step-input. Артефакт без evidence — reject перед INSERT. Source: i2i evidence-first pattern adapted + `brand-intel/CONTRACTS.md §2 LLM output schemas`.
