# REVIEW + Agent Worktree Protocol + Agents Table

> Lazy-loaded коли user prompt згадує: review, code-review, worktree, sub-agent, spawn, critical zone, merge, branch, parallel agents

## REVIEW (two-tiered)

**Inline self-review** після кожної Tier 1/2 зміни:

- Прочитай diff власного commit'а свіжими очима.
- Перевір `evidence_refs` на всіх нових Zod schemas.
- Перевір `organization_id` на всіх DB writes.
- Перевір що клієнтський код не імпортує `supabase-service-role-key` випадково.

**CRITICAL zone review** — обов'язковий через `code-reviewer` agent для змін у:

- `lib/schemas/*.ts` — Zod schemas (контракт з LLM).
- `lib/events.ts` — Inngest event shapes.
- `inngest/functions/**` — pipeline orchestration.
- `supabase/migrations/**` — schema changes.
- `app/api/webhooks/**` — inbound HTTP. Hackathon: empty (Telli `[DEFERRED]`, Peec MCP-only). Post-hackathon attack surface returns.
- `lib/supabase/rls/**` — RLS policy helpers.

Якщо зміна зачіпає CRITICAL zone і у чаті не було code-reviewer run — не commit'ай.

---

## Agent Worktree Protocol

Для Tier 3 і для чутливих refactor'ів:

1. Spawn agent у `isolation: "worktree"` мод.
2. Agent робить зміни у branch'і, не у main worktree.
3. Після agent completion — `git diff main..{branch}` у main worktree для review.
4. Тільки після Glib'ового "ok" — merge.

Не використовуй worktree для тривіальних правок — overhead > value.

---

## Agents (Claude agent types we spawn)

| Agent | When | Tools |
|-------|------|-------|
| `code-reviewer` | CRITICAL zone edits | Read, Grep, Glob, Bash |
| `tdd-guide` | Нова pipeline function | Read, Write, Edit, Bash |
| `database-reviewer` | Нова migration | Read, Write, Edit, Bash |
| `security-reviewer` | Webhook route / auth logic | Read, Write, Edit, Bash |
| `refactor-cleaner` | Після feature branch перед merge | Read, Write, Edit, Bash |
| `Explore` | "Where does X happen?" | Read-only |
| `Plan` | Tier 3 architecture change | Read-only |
