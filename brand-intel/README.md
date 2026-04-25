# BBH — Brand Intelligence Agent

> **Intelligence layer над Peec MCP.** Peec sees the brand pulse. BBH closes the loop: classify deltas → counter-narrative → multi-channel content → daily Slack brief → human approval. One runtime → N брендів через `organization_id`.

**Статус:** pre-demo. Pivots:
- 2026-04-24: plugin → webapp stack (`decisions/2026-04-24-deployment-webapp.md`).
- 2026-04-25 (early): hackathon scope cut (`decisions/2026-04-25-hackathon-scope-cut.md`).
- 2026-04-25 (mid): Peec overlay positioning (`decisions/2026-04-25-peec-overlay-pivot.md`) — BBH стає intelligence layer над Peec MCP. Overlay vision + 5 pipelines authoritative; Peec REST + demo brand sections superseded.
- 2026-04-25 (late): MCP-only Peec access via Claude Code snapshot (`decisions/2026-04-25-mcp-only-peec-attio-demo.md`) — Peec accessed via MCP browser OAuth, data persisted у `data/peec-snapshot.json`. **Demo brand pivot: BBH self-promo → Attio (vs Salesforce + HubSpot)** — одна з 3 готових Peec MCP Challenge test projects.

Plugin-era docs — у `_archive/` як superseded.

**Deadline:** hackathon demo 2026-04-25.

**Public demo URL:** `https://bbh.vercel.app/demo/attio` (без auth). Slug `attio` resolve'ується до hardcoded UUID у `supabase/seed.sql` (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`) з окремою `"{t}_public_demo"` RLS policy.

---

## Що робить агент

Чотири pipeline'и full design (W4/W5/W6/W9) + два додаткові hackathon-active (W7/W6′). Кожен — окрема Inngest function з evidence chain від raw input до видимого артефакту:

**W4 — Public widget.** `[FULL DESIGN — DEFERRED post-hackathon]` Embeddable `<iframe src="/widget/{brand_id}">` що показує живі наративи (як LLM описують бренд) + citations. Регенерується on event коли з'являються нові snapshots.

**W5 — Narrative simulator.** `[ACTIVE]` По seed (competitor move або user prompt) генерує ranked counter-narratives з score reasoning. Output — список з 3–5 варіантів, не єдина "правильна" відповідь.

**W6 — Morning brief.** `[FULL DESIGN — DEFERRED post-hackathon, superseded by W6′]` Daily 08:00 local time. Telli voice-agent дзвінок (primary) або ElevenLabs TTS (fallback) або markdown у dashboard. Replaced by W6′ Slack text version для hackathon.

**W6′ — Morning brief Slack.** `[ACTIVE]` Daily 8am UTC text summary (~200w) → real Slack send via incoming webhook. Persists у `brief_deliveries` table. Spec → `features/morning-brief.md`.

**W7 — Multi-channel expand.** `[ACTIVE]` Один approved counter-draft → 4 variants (blog ~800w, X thread 5 tweets, LinkedIn ~200w, email subject+body). Auto-trigger на counter-draft approval. Persists у `content_variants`. Spec → `features/content-expansion.md`.

**W9 — Competitor radar.** `[ACTIVE]` Peec snapshot (`data/peec-snapshot.json`, refreshed manually via Claude Code MCP session) + Tavily fresh news → класифікує signals по severity+sentiment → для `severity=high` автоматично генерує counter-draft зі `status='draft'`. Human approval обов'язкова перед publish (див. `decisions/2026-04-24-counter-draft-severity-high-only.md`).

---

## Scope (v1, hackathon cut)

**In scope (hackathon-active):**
- Next.js 14 App Router webapp на Vercel з public demo route `/demo/attio`.
- Supabase Postgres для signals/counter_drafts/runs/competitors/narrative_variants/content_variants/brief_deliveries. pgvector reserved для post-hackathon dedup.
- Inngest step functions для W9 + W5 + W7 + W6′ pipelines (manual demo triggers; cron post-hackathon).
- External APIs hackathon-active: **Peec snapshot file** (`data/peec-snapshot.json`, refreshed manually via Claude Code MCP session), **Tavily** (live web/news search), **OpenAI + Anthropic** (LLM + embeddings), **Slack incoming webhook** (W6′ delivery).
- Multi-tenant через `organization_id` + RLS. Public demo (Attio) — окрема policy без auth.
- Zod schemas на кожному LLM output boundary.
- Evidence-first artifacts: `evidence_refs: string[]` `.min(1)` enforce.

**Deferred (post-hackathon):**
- W4 public widget + iframe embed.
- W6 Telli voice-agent + ElevenLabs TTS (superseded by W6′ Slack).
- Resend email delivery (Slack-only sufficient).
- Firecrawl scrape (Tavily covers).
- pgvector embeddings + similarity dedup.

**Non-goals v1:**
- Paid tiers / billing / Stripe integration.
- Multi-tenant admin UI (створення orgs, invite teammates, role management).
- Mobile apps (iOS/Android native).
- Kanban/queue UI для counter-drafts — approval через direct SQL `UPDATE status='approved'` або simple form у `/demo/{brand}/drafts`.
- Competitor sentiment trending charts — залишено на post-demo.
- Custom brand-specific pipeline hooks — див. ADR-005 revisit condition.

---

## Stack (locked 2026-04-24)

| Layer | Choice | ADR |
|-------|--------|-----|
| Frontend | Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui | ADR-001-R |
| Runtime | Vercel (edge + serverless) | ADR-001-R |
| Storage | Supabase (Postgres + Auth + Storage + pgvector), eu-west-1 | ADR-002-R |
| Orchestration | Inngest step functions | ADR-004-R |
| Multi-brand | `organization_id` column + RLS policies | ADR-005 |
| Subagent boundary | Inline step за замовчуванням, окрема Inngest function при parallelism/bloat/contract | ADR-003 |
| LLM | OpenAI (embeddings + structured output), Anthropic (reasoning) | (implicit) |
| Peec data | Snapshot file `data/peec-snapshot.json` refreshed via Claude Code MCP session | `decisions/2026-04-25-mcp-only-peec-attio-demo.md` |
| Brief delivery (hackathon) | Slack incoming webhook (W6′) | `decisions/2026-04-25-peec-overlay-pivot.md` |
| Voice (full design, deferred) | Telli (primary), ElevenLabs (fallback), markdown (last resort) | (PIPELINES.md W6, deferred) |

---

## Як читати цю папку

`brand-intel/*.md` — це reference docs. Не туторіали, не quickstart. Кожен файл відповідає на конкретне питання:

- **`README.md`** (ти тут) — що і навіщо. Vision + scope + stack one-liner.
- **`ARCHITECTURE.md`** — як воно виглядає як система. Topology, request flow, component layers, pipeline architecture, schema overview.
- **`CONTRACTS.md`** — точні shape'и. Zod schemas, DB tables DDL, API routes, webhook payloads.
- **`PIPELINES.md`** — per-pipeline деталі. W4/W5/W6/W9 по окремості — steps, cost envelope, evidence requirements, failure modes.
- **`RUNBOOK.md`** — ops. Deploy procedure, migration rollout, key rotation, incident response, rollback.
- **`CLI-TOOLS.md`** — CLI cheatsheet. supabase/vercel/inngest/pnpm workflow команди з прикладами.
- **`GAPS.md`** — відомі failure modes + заплановані mitigations. Чесний список того що ми знаємо що не покрите.

**Коли `brand-intel/{file}.md` і `knowledge/{domain}/knowledge.md` конфліктують** — brand-intel виграє як джерело істини. `knowledge/` оновлюється щоб збігатись.

**`_archive/`** — plugin-era документація (superseded 2026-04-24). Не читай для "як зроблено зараз". Цитуй тільки коли обговорюється історія рішень. `_archive/STATUS.md` пояснює що куди.

---

## Quick demo flow (hackathon)

1. Відкриваєш `https://bbh.vercel.app/demo/attio` з телефону — dashboard з audit panel (last radar run stats), competitors panel (Attio + Salesforce + HubSpot), active signals (24h), counter-drafts queue, simulator outputs, multi-channel content variants, morning brief preview.
2. Клікаєш counter-draft → бачиш evidence chain (signal UUID + Peec snapshot timestamp + Peec dashboard deep link, або Tavily source URL).
3. Approve draft → W7 auto-triggers → 4 multi-channel variants (blog/X/LinkedIn/email) з'являються через ~30s.
4. "Send today's brief now" у Morning brief section → real Slack message posts до demo channel.
5. Trigger'имо W9 (competitor radar) manually через "Run radar now" → Inngest UI показує step trace → новий signal + draft з'являються у feed.

Повний demo-day сценарій — `RUNBOOK.md#demo-day-checklist`.

---

## Подальше читання

- **Архітектурні "чому"** → `decisions/` (ADR index у `decisions/README.md`).
- **Semantic memory** (per-domain factual state) → `knowledge/INDEX.md`.
- **Робочі інструкції для Claude** → `CLAUDE.md` (корінь repo).
