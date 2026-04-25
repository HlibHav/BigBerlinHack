---
date: 2026-04-24
status: accepted
topic: deployment form
supersedes: 2026-04-24-deployment-plugin.md
superseded_by: none
adr_ref: ADR-001-R (new brand-intel/ARCHITECTURE.md)
---

# Deploy brand-intel як Next.js webapp на Vercel + Supabase

## Context

Попереднє рішення (ADR-001) запаковувало brand-intel у Claude Code plugin. Під кінець планування стало ясно що plugin form структурно не може виграти хакатон 2026-04-25:

- Немає публічного URL для журі.
- CLI/Cowork output не конкурує з візуальними dashboard'ами.
- Widget W4 має бути embeddable `<iframe>` — плагін цього не дає.
- Telli voice-agent потребує публічний webhook endpoint — scheduled-tasks MCP не приймає inbound HTTP.
- Жюрі не буде ставити Cowork + plugin для перевірки.

Glib (2026-04-24): "щоб перемогти на хакатоні це точно має бути не плагін."

## Decision

Brand Intelligence Agent розгортається як Next.js 14 webapp:

- **Frontend:** Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui.
- **Runtime:** Vercel (edge + serverless functions).
- **Storage:** Supabase (Postgres + Auth + Storage + pgvector), eu-west-1.
- **Pipeline orchestration:** Inngest step functions.
- **Inbound webhooks:** Next.js route handlers (`app/api/webhooks/telli/route.ts`).
- **Public surfaces:** `/demo/{brand_id}` dashboard + `/widget/{brand_id}` iframe-embeddable + webhook endpoints.
- **Auth:** public demo-brand no auth; Supabase Auth for private brands post-hackathon.

## Alternatives considered

- **Claude Code plugin** (попереднє) — структурно не підходить для хакатону. Відкинуто.
- **Pure serverless backend + static React frontend** — економія на Next.js abstraction, але втрачаємо server actions, RSC streaming, shared runtime auth. Для hackathon швидкості Next.js виграє.
- **Self-hosted Node + Postgres на Fly.io/Railway** — більше контролю, але більше ops. Supabase дає Auth+Storage+pgvector як managed bundle.
- **Keep plugin + add public webapp як "demo frontend"** — 2x codebase, 2x state sync, найгірший варіант. Відкинуто.

## Reasoning

- **Public URL** — журі відкриває `https://bbh.vercel.app/demo/vck` з телефону, бачить dashboard за 5 секунд.
- **Embeddable widget** — Next.js route `/widget/{id}` повертає standalone HTML, iframe works out of box.
- **Webhook-ready** — Telli callback приходить на `/api/webhooks/telli`, signature verification на route handler.
- **Visual impact** — shadcn/ui + Tailwind дають "приємний на око" dashboard за days, а не weeks.
- **Supabase bundle** — Postgres + pgvector + Auth + Storage в одному сервісі, скорочує integration effort.
- **Vercel deploy** — `git push main` → production URL, zero ops.

## Trade-offs accepted

- **Cold start латенція** на serverless functions (~300-800ms для Inngest steps). Mitigation: Vercel Edge для hot paths (widget render), serverless для pipeline (де латенція не critical).
- **Vendor lock-in на Supabase + Vercel** — портабельність нижча ніж у self-hosted. Для hackathon acceptable; post-demo можна мігрувати якщо знадобиться.
- **Complexity ↑** — треба Next.js + Supabase + Inngest knowledge замість просто skills. Glib вже робив i2i з таким stack'ом, так що learning curve пройдений.
- **Cost** ≈$0-20/month для hackathon scale (Vercel free tier + Supabase free tier + Inngest free tier).

## Revisit when

- Після хакатону: якщо не виграли і продукт паузиться — можна мігрувати critical pipeline у plain скріпти щоб знизити Vercel залежність.
- Якщо Vercel pricing для brand-intel workload стрибне >$100/mo — розглянути Railway/Fly.
- Якщо з'являється white-label customer з on-prem вимогою — розглянути Docker deployment альтернативу.
