---
status: superseded
superseded_on: 2026-04-24
supersedes: plugin-era brand-intel architecture (ADR-001, ADR-002, ADR-004)
superseded_by:
  - decisions/2026-04-24-deployment-webapp.md
  - decisions/2026-04-24-storage-supabase-pgvector.md
  - decisions/2026-04-24-scheduling-inngest.md
---

# Archived: brand-intel/ plugin-era docs

## Why archived

Glib's direct call on 2026-04-24:

> щоб перемогти на хакатоні це точно має бути не плагін

Plugin form has critical weaknesses for hackathon demo scoring:

- **Немає публічного URL** — журі не може відкрити посилання з телефону, все живе в CLI/Cowork сесії.
- **Zero visual impact** — CLI output не конкурує з dashboard'ами які покаже решта команд.
- **Не embeddable** — widget W4 задуманий як public `<iframe>`, плагін не може цього дати.
- **Telli webhooks потребують публічний endpoint** — scheduled-tasks MCP не приймає inbound HTTP.
- **Journey installation friction** — щоб показати жюрі треба щоб вони поставили Cowork + плагін. Неможливо в рамках demo.

Full rationale — `decisions/2026-04-24-deployment-webapp.md`.

## Що тут лежить

Сім документів + `config/` + `docs/` описують plugin-era архітектуру:

| Файл | Зміст | Replacement |
|------|-------|-------------|
| `README.md` | Vision + navigation для plugin | нова `brand-intel/README.md` (webapp) |
| `ARCHITECTURE.md` | 5 ADR, file-system state, scheduled-tasks MCP | нова `brand-intel/ARCHITECTURE.md` (Next.js + Inngest + Supabase) |
| `CONTRACTS.md` | JSON Schema frontmatter для markdown артефактів | нова `brand-intel/CONTRACTS.md` (Zod + DB schemas) |
| `SKILLS.md` | 4 skills як SKILL.md файли | `brand-intel/PIPELINES.md` (Inngest step functions) |
| `GAPS.md` | 14 провалин plugin-era | re-audit під webapp (auth/RLS/webhooks/cold starts) |
| `CLI-TOOLS.md` | bats/direnv/ajv/shellcheck | `supabase`, `vercel`, `inngest-cli`, `drizzle-kit` |
| `RUNBOOK.md` | Plugin install, Telli setup, manual runs | Vercel deploy, Supabase migrations, Inngest setup |

## Що залишається валідним

Не все треба викидати. Ці рішення переживають pivot без змін:

- **ADR-003 (subagent boundary)** — три критерії для spawn. Валідно й для Inngest step functions: spawn окремий step тільки якщо parallel + context bloat + self-contained contract.
- **ADR-005 (brand as parameter)** — один runtime, N брендів. Тепер це `organization_id` колонка в Supabase замість `config/{brand}.yaml` path. Принцип той самий.
- **Telli voice-agent рішення** — stays. Тепер Telli webhook приходить на Next.js route handler замість plugin skill trigger.
- **severity=high only для counter-drafts** — stays. Policy не залежить від stack'у.

## Як використовувати цей archive

- **Нічого не редагувати тут.** Якщо знайдено проблему в мисленні — записувати в нові `brand-intel/*.md`, не тут.
- **Цитувати можна** — коли обговорення торкається "а чому ми не пішли plugin шляхом", посилайся на ці файли + відповідний superseding ADR.
- **Не читати для "як щось зроблено"** — код/архітектура актуального проєкту жодним чином не відображена тут.

## Crossrefs

- `decisions/2026-04-24-deployment-webapp.md` — supersedes ADR-001.
- `decisions/2026-04-24-storage-supabase-pgvector.md` — supersedes ADR-002.
- `decisions/2026-04-24-scheduling-inngest.md` — supersedes ADR-004.
- `decisions/2026-04-24-subagent-boundary.md` (ADR-003) — stays valid, re-scoped до Inngest steps.
- `decisions/2026-04-24-brand-as-parameter.md` (ADR-005) — stays valid, re-mapped до `organization_id`.
