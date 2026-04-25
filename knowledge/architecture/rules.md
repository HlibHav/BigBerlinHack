# Architecture — rules (confirmed behavior)

> Правила яким Claude слідує без питань у цьому домені.

## Pipeline boundary rules

- **Окрема Inngest function by justification only.** Default — inline `step.run(...)` в parent function. Окрема function обґрунтовується трьома критеріями з ADR-003: parallelism + context bloat + self-contained contract. Якщо не всі три — inline. Source: ADR-003, confirmed 2026-04-24.
- **Brand як parameter через `organization_id`.** Ніколи не hardcode `organization_id` всередині function чи route handler. Завжди параметр з event payload або URL path. Source: ADR-005, re-scoped 2026-04-24 (was `config/{brand}.yaml` path, now DB column).

## DB write rules

- **Zod parse перед INSERT.** Кожен LLM output проходить `schema.parse(data)` до `supabase.from(...).insert(...)`. Malformed — step fail з retry, не пишемо battery row. Source: i2i pattern adapted, confirmed 2026-04-24.
- **`organization_id` обов'язковий на всіх INSERT/UPDATE.** Навіть коли service role — явно передавай. RLS може обійти через service role accidentally, але явний `organization_id` гарантує правильний scope. Source: ADR-002-R, confirmed 2026-04-24.
- **Evidence refs required.** Кожен artifact (snapshot/signal/counter-draft/narrative) має `evidence_refs` array з ≥1 item. Zod schema enforces. Source: i2i evidence-first adapted, confirmed 2026-04-24.
- **Schema changes via migration.** Жодного manual DDL на production. Усі schema changes — `supabase/migrations/{timestamp}_{name}.sql`. Source: ADR-002-R, confirmed 2026-04-24.

## Deployment rules

- **Webapp form, не plugin.** Не пропонуй refactor у Claude Code plugin — це явно superseded рішення. Plugin-era docs — у `brand-intel/_archive/`, там for history only. Source: ADR-001-R, confirmed 2026-04-24.
- **Scheduling через Inngest only.** Не пропонуй cron/launchd/pg_cron/Vercel Cron як primary mechanism. Inngest — single source для scheduled + event-triggered workflows. Vercel Cron ок як trigger що emit'ить Inngest event, але не як direct workflow runner. Source: ADR-004-R, confirmed 2026-04-24.
- **State у Supabase, не файли.** Не пропонуй JSONL/Markdown state персистентно. `supabase/seed.sql` і `brand-intel/_archive/` — це exception (seed і superseded docs). Source: ADR-002-R, confirmed 2026-04-24.

## Client bundle rules

- **Zero secrets у client.** Ніякі API keys (Peec/Telli/OpenAI/Anthropic/Supabase service role) не потрапляють у Next.js client bundle. Server-only — `lib/mcp/*`, `lib/supabase/server.ts`, route handlers, server actions, Inngest functions. Source: i2i pattern adapted, confirmed 2026-04-24.
- **`supabase-js` client anon key only у browser.** Service role ключ — тільки server. Source: same as above.

## Webhook rules

- **Signature verification на route handler.** Telli callback і Peec push (якщо буде) — verify signature як перший step route handler. Invalid signature → 401 без side effects. Source: security-reviewer pattern, confirmed 2026-04-24.
- **Webhook route emit'ить Inngest event, не виконує pipeline inline.** Route handler має бути <500ms, вся важка робота — async через Inngest. Source: ADR-004-R, confirmed 2026-04-24.
