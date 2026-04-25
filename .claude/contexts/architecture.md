# Architecture Principles + Pipeline Contract

> Lazy-loaded коли user prompt згадує: inngest, pipeline, step, function, worker, cron, event, agent, schema flow

## Architecture Principles (CRITICAL)

**Evidence-first.** Кожен артефакт (snapshot, signal, counter-draft, narrative) має `evidence_refs: string[]` — список URL/file/DB-row з яких це було виведено. Артефакт без evidence — bug, не feature. Zod schema enforces `.min(1)` на `evidence_refs` для всіх agent output.

**State machine via Inngest.** Pipeline run — це DAG step'ів зі станами `queued → processing → step_N → completed | failed`. Кожен `step.run(...)` — retry незалежно, idempotent. Жодних "fire and forget" LLM calls.

**GDPR by construction.** Кожна таблиця має `organization_id`. Кожна таблиця має RLS policy через `get_user_org_id()`. Cascade delete на `organizations` видаляє все. Не читай і не пиши нічого без `organization_id` context.

**Zod перед DB.** Agent LLM output → Zod parse → INSERT. Якщо Zod fail'нув — step fails з retry, не пишемо malformed rows. Schema драйфт ловиться на step рівні, не у production.

**Pgvector для семантики.** Snapshots, citations, signals мають `embedding vector(1536)`. Similarity search для dedup (W9) і clustering (W4/W5). Embeddings генеруються у `step.run("embed", ...)`, зберігаються разом з row.

**No client-side secrets.** Next.js client bundle не містить API keys. Усі MCP calls — server-side (route handlers, Inngest steps, server actions).

---

## Agent Pipeline Contract

Кожен pipeline — Inngest function. I/O контракт:

```ts
// lib/events.ts
export const MorningBriefEvent = z.object({
  organization_id: z.string().uuid(),
  run_window_start: z.string().datetime(),
  call_preference: z.enum(["voice-agent", "tts", "markdown"]),
});
```

**Правила:**

1. Event schemas в `lib/events.ts` — single source of truth.
2. Кожен step named — `snapshot-fetch`, `embed-citations`, `llm-synthesize`, `persist-run` — з'являється в Inngest UI trace.
3. Кожен LLM call обгорнуто в Zod schema для structured output.
4. Кожен external MCP call має cost accounting у `step.run("log-cost", ...)` що пише у `cost_ledger`.
5. Кожен run closed з `step.run("persist-run", ...)` → `runs` table, `ok: true|false`, `reason` якщо fail.

**Коли spawn'ити окремий Inngest function vs inline step** — див. `decisions/2026-04-24-subagent-boundary.md`. Три критерії: parallelism + context bloat + self-contained contract. Default to inline step.
