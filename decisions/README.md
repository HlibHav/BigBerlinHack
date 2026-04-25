# Decisions journal

> Історія вибору. Кожен файл — одне рішення. Формат і правила — в `CLAUDE.md` → Block 2.

**Як шукати:** `grep -lr "{topic}" decisions/` перед тим як пропонувати новий вибір по темі.

**Як називати:** `YYYY-MM-DD-{topic-kebab}.md`.

**Як закривати рішення:** встанови `status: superseded`, додай `superseded_by: {new-file}`, не видаляй старе.

## Active (newest first)

- [2026-04-25-mcp-only-peec-attio-demo.md](2026-04-25-mcp-only-peec-attio-demo.md) — `accepted` — Peec доступ виявився MCP-only через browser OAuth у Claude Code (no REST API key для Challenge participants). Strategy: pull Peec data manually у Claude Code session → persist у `data/peec-snapshot.json` → Inngest functions read JSON. Demo brand pivot: BBH self-promo → **Attio (vs Salesforce + HubSpot)** — одна з 3 готових Peec test projects. Supersedes Peec REST API + demo brand sections of overlay-pivot ADR.
- [2026-04-25-peec-overlay-pivot.md](2026-04-25-peec-overlay-pivot.md) — `partially superseded` (by mcp-only-peec-attio-demo) — BBH стає intelligence layer над Peec MCP. 5 active pipelines: W9 (Peec primary + Tavily supplementary), W5, W7 multi-channel, W6′ Slack brief. Schema additions: `content_variants`, `brief_deliveries`, `signals.position`, `signal_source_type='peec_delta'`. **Peec REST + demo brand sections superseded; overlay vision + pipelines + schema additions still authoritative.**
- [2026-04-25-hackathon-scope-cut.md](2026-04-25-hackathon-scope-cut.md) — `accepted` — Hackathon (2026-04-25) scope: W9 + W5 + dashboard з UX patches. W4 + W6 deferred. Schema additions: `competitors`, `runs.stats jsonb`, `narrative_variants`, `competitors.relationship='self'`. Marketer feedback drove cuts. Peec sections superseded by Peec-overlay-pivot ADR.
- [2026-04-24-scheduling-inngest.md](2026-04-24-scheduling-inngest.md) — `accepted` — Scheduling + pipeline orchestration через Inngest step functions (supersedes ADR-004).
- [2026-04-24-storage-supabase-pgvector.md](2026-04-24-storage-supabase-pgvector.md) — `accepted` — State у Supabase Postgres + pgvector, `organization_id` scope + RLS (supersedes ADR-002).
- [2026-04-24-deployment-webapp.md](2026-04-24-deployment-webapp.md) — `accepted` — Deploy як Next.js webapp на Vercel + Supabase (supersedes ADR-001).
- [2026-04-24-counter-draft-severity-high-only.md](2026-04-24-counter-draft-severity-high-only.md) — `accepted` — Auto-generate counter-drafts only for severity=high.
- [2026-04-24-voice-agent-telli.md](2026-04-24-voice-agent-telli.md) — `accepted` — Morning brief через Telli voice-agent (mode B), з TTS fallback.
- [2026-04-24-brand-as-parameter.md](2026-04-24-brand-as-parameter.md) — `accepted` — Brand як parameter (ADR-005, re-scoped до `organization_id` у Supabase).
- [2026-04-24-subagent-boundary.md](2026-04-24-subagent-boundary.md) — `accepted` — Subagent/step spawn лише при трьох критеріях (ADR-003, re-scoped до Inngest steps).

## Superseded

- [2026-04-24-deployment-plugin.md](2026-04-24-deployment-plugin.md) — `superseded` by `2026-04-24-deployment-webapp.md` — plugin form не проходить hackathon criteria.
- [2026-04-24-file-state-no-database.md](2026-04-24-file-state-no-database.md) — `superseded` by `2026-04-24-storage-supabase-pgvector.md` — file state не виживає в serverless runtime.
- [2026-04-24-scheduling-catchup.md](2026-04-24-scheduling-catchup.md) — `superseded` by `2026-04-24-scheduling-inngest.md` — `scheduled-tasks` MCP доступний тільки у plugin runtime.

## Pivot context (2026-04-24)

Три supersedes вище ухвалені одночасно після Glib'ового рішення "щоб перемогти на хакатоні це точно має бути не плагін". Причини і trade-offs — у `brand-intel/_archive/STATUS.md` та в самому `2026-04-24-deployment-webapp.md`. ADR-003 (subagent boundary) і ADR-005 (brand as parameter) пережили pivot без змін принципу, тільки re-scope до нового runtime.
