# Quality Gates (Block C)

> Lazy-loaded коли user prompt згадує: gate, готово, ready, verify, demo, dry-run, hackathon, deploy, ship

Агент не може об'єктивно оцінити власну роботу. Для кожного типу результату — конкретні критерії. Якщо не passed — не відданий.

## Gate A — DB writes (Supabase INSERT/UPDATE)

- [ ] Zod schema parse'нула дані **перед** запитом.
- [ ] `organization_id` встановлений і відповідає контексту запиту.
- [ ] RLS policy перевірена (не покладаємося лише на service role бо може обійти захист accidentally).
- [ ] Немає hardcoded PII/secret'ів у insert payload.
- [ ] Evidence refs (де застосовно) — ≥1, валідні URL/DB refs.

## Gate B — Pipeline output (brief, counter-draft, narrative, signal)

- [ ] ≤ cost_envelope (див. `brand-intel/PIPELINES.md`).
- [ ] **Slack brief (W6′ ACTIVE):** ≤200 слів LLM-synthesized + ≤2000 chars Slack message body.
- [ ] **Voice brief (W6 DEFERRED):** ≤200 слів перед TTS/voice-agent. Re-applies post-reactivation.
- [ ] **Counter-draft:** тон = brand voice pillar; source citation; немає claims без data; немає competitor PII окрім публічних handles.
- [ ] **Narrative result:** ranked output з score reasoning, не просто numbers.
- [ ] **Content variants (W7 ACTIVE):** 4 channels (blog/x_thread/linkedin/email); X thread tweets ≤280 chars each.
- [ ] Run logged у `runs` таблицю з `ok: true|false` + `reason` якщо fail.

## Gate C — Code/schema change

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (нові tests для нових Zod schemas).
- [ ] Якщо змінилась migration — `supabase db reset` локально passes + `pnpm types:gen` регенерований.
- [ ] Якщо додано external call — cost tracking у `cost_ledger` + budget check.
- [ ] Cross-refs у `brand-intel/*.md` оновлені (не лишилось "див. ADR-X" коли став ADR-Y).

## Gate D — Demo readiness (hackathon 2026-04-25)

Див. `brand-intel/RUNBOOK.md §8 Demo-day checklist`. Ключові:

- [ ] `supabase/seed.sql` prepopulates demo brand state.
- [ ] `/demo/attio` renders без console errors на iPhone Safari.
- [ ] `/widget/attio` embeddable у test `<iframe>` без CORS issues. `[DEFERRED — W4 cut]`
- [ ] Slack incoming webhook test post успішний + W6′ "Send today's brief now" verified.
- [ ] Telli test call успішний + backup pre-recorded audio. `[DEFERRED — W6 voice cut]`
- [ ] Inngest functions deploy'нуті і health check ok.
- [ ] Wall-time demo run-through ≤4 хв, repeated тричі.

## Gate E — Docs edit

- [ ] Grep ключові фрази — немає суперечностей між цим файлом і зміненим.
- [ ] Cross-references оновлені (зворотні лінки).
- [ ] Якщо ADR superseded — status оновлений + `superseded_by` додано + `decisions/README.md` синхронізований.

## Коли gate не passed

- "Gate X failed: {reason}" у відповіді + пропозиція виправлення.
- Не переходь до наступного gate поки поточний fail.
