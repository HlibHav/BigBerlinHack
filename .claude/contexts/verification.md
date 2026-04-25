# Full-Stack Verification + Testing

> Lazy-loaded коли user prompt згадує: typecheck, lint, test, vitest, playwright, coverage, verify, готово, ready, e2e

## Full-Stack Verification

Перед "готово" на feature:

1. Migration applied локально: `supabase db reset` → `supabase db push`.
2. Types regenerated: `pnpm types:gen`.
3. TypeScript passes: `pnpm typecheck`.
4. Lint passes: `pnpm lint`.
5. Tests pass: `pnpm test`.
6. Inngest local: `inngest-cli dev` → trigger event manually → trace показує всі steps ok.
7. Next.js dev: `pnpm dev` → відкрий relevant route → UI render без console errors.

Якщо crossing external API (hackathon-active: Tavily, OpenAI, Anthropic, Slack webhook):
- Тест з real API key у `.env.local` (Tavily/OpenAI/Anthropic) або real Slack webhook URL.
- Peec — local snapshot file read, no API key needed; verify `data/peec-snapshot.json` is up-to-date via Claude Code MCP refresh.
- Перевір `cost_ledger` row після run (Tavily/OpenAI/Anthropic).
- Rate limit handling — при 429 step retries з backoff.
- `[DEFERRED]` Firecrawl/Telli/ElevenLabs — не у hackathon scope, verification rules re-apply post-reactivation.

---

## Testing

- **Unit:** `vitest` для pure functions + Zod schemas.
- **Integration:** vitest для Inngest functions з mocked MCP calls.
- **E2E:** Playwright для critical paths (widget render, `/demo` dashboard load, Telli webhook acceptance).
- **Coverage gate:** 70% на `lib/schemas/` + `inngest/functions/`. Не gate'уємо UI компоненти.
- **Zod schema tests:** кожна schema має 1+ success і 1+ failure case.
- **No mocks у тестах що перевіряють RLS** — крути проти реальної test Supabase project з seed data.

---

## Gate C — Code/schema change (quick reference)

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (нові tests для нових Zod schemas).
- [ ] Якщо змінилась migration — `supabase db reset` локально passes + `pnpm types:gen` регенерований.
- [ ] Якщо додано external call — cost tracking у `cost_ledger` + budget check.
- [ ] Cross-refs у `brand-intel/*.md` оновлені.

Full Gates A-E → див. gates.md.
