---
date: 2026-04-24
status: accepted
topic: scheduling mechanism
supersedes: 2026-04-24-scheduling-catchup.md
superseded_by: none
adr_ref: ADR-004-R (new brand-intel/ARCHITECTURE.md)
---

# Scheduling та pipeline orchestration через Inngest step functions

## Context

Попереднє рішення (ADR-004) використовувало `scheduled-tasks` MCP у Claude Code plugin. Після pivot на webapp (ADR-001-R) цей механізм більше не доступний — plugin-only. Нам потрібно:

- **Cron-like schedule** для `morning-brief` (daily 08:00) і `competitor-radar` (every 6h).
- **Durable step execution** — LLM calls, MCP queries, Supabase writes мають retry і idempotency.
- **Webhook triggers** — Telli callback кидає event у pipeline, без polling.
- **State machine** — brief: queued → snapshot → synthesize → voice → completed | failed, з step-level retry.
- **Observability** — бачити de running runs, які step'и fail'нули, як довго.

## Decision

Inngest step functions як orchestration layer:

- **Scheduled functions:** `morningBriefSchedule` (cron `0 8 * * *`), `competitorRadarSchedule` (cron `0 */6 * * *`).
- **Event-triggered functions:** `telliWebhookHandler` (event `telli.call.completed`), `widgetRegenerate` (event `brand.config.updated`).
- **Steps:** кожен LLM call / external API / DB write обгорнуто у `step.run(name, fn)` — retry per step, durable.
- **Idempotency:** event key = `${brand_id}:${run_window_start}` — дублі скасовуються.
- **Catch-up:** якщо scheduled run пропущено (Vercel downtime) — Inngest ставить у чергу і виконує при наступному health check. Для competitor-radar — один catch-up run, не N.
- **State persistence:** `run_id`, `step_status`, `step_output` дублюються у Supabase `runs` таблицю для UI observability.

## Alternatives considered

- **Vercel Cron + plain API routes** — працює для schedule, але немає step-level retry, немає webhook events, немає observability UI. Треба будувати queueing самостійно.
- **AWS Lambda + EventBridge + SQS** — надпотужно, але 3x complexity, 3x vendor. Для hackathon — overengineered.
- **Supabase Edge Functions + pg_cron** — DB triggers pgcron для schedule, Edge Functions для execution. Працює, але: (a) retry логіка manual, (b) webhook verification складніша ніж у Next.js route handler, (c) Edge Function cold start на LLM call гаряче.
- **Temporal Cloud** — best-in-class для durable workflows. Overkill для hackathon, окрема інтеграція.
- **BullMQ + self-hosted Redis** — contradict ADR-001-R "no ops". Відкинуто.

## Reasoning

- **Inngest step model = natural fit** для "fetch snapshot → validate → embed → insert → synthesize → send" pipelines де кожен крок може fail незалежно.
- **Dev experience:** `inngest-cli dev` піднімає local UI для traces — дебаг pipeline без deploy.
- **Vercel integration** — Inngest SDK розгортається як одна API route, zero config.
- **Free tier достатній** — 50k step executions/month, покриває hackathon і early users.
- **Step isolation** допомагає cost control — якщо LLM step зламався, не викликаємо наступні steps які платили б за нього.
- **Catch-up behavior** — схоже до plugin "catch-up on first open" концепції, але без залежності від user відкриваючого Cowork.

## Trade-offs accepted

- **Vendor lock-in на Inngest** — якщо сервіс умре або ціни зростуть, треба буде переписати. Mitigation: step functions написані як чисті async functions, легко обгорнути у власний executor.
- **Dev complexity** — треба тримати `inngest-cli` у dev environment для local testing.
- **Webhook signing** — Telli events проходять через Next.js route handler → Inngest event emit, треба signature verify на route handler рівні.
- **Observability split** — логи Inngest dashboard + Supabase `runs` таблиця + Vercel function logs. Три місця для debug. Acceptable для hackathon.

## Revisit when

- Inngest pricing >$50/mo — evaluate Temporal або self-hosted alternatives.
- Step count per run стабільно >30 — signal що pipeline треба розбити на multiple independent workflows замість one mega-workflow.
- Retry storms через LLM rate limits — додати circuit breaker layer поверх Inngest.
- Post-hackathon якщо проект paused — мігрувати на Vercel Cron + inline retry для зниження залежностей.

## Implementation note

Схему даних Inngest events тримаємо в `lib/events.ts` як Zod schema — emit-time validation. Scheduled functions ім'я мають `{function}Schedule`, event-triggered — `{domain}Handler`. Runs пишуться у Supabase через `step.run("persist-run", ...)` щоб UI dashboard бачив state без Inngest API полінгу.
