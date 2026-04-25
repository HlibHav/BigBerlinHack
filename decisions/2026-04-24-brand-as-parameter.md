---
date: 2026-04-24
status: accepted
topic: multi-brand support
supersedes: none
superseded_by: none
adr_ref: ADR-005 (`brand-intel/ARCHITECTURE.md §6 Multi-brand isolation`; archived plugin-era version у brand-intel/_archive/ARCHITECTURE.md)
post_pivot_note: principle ("brand as parameter, not forked code") stays valid; mapping changed — було `config/{brand}.yaml` path + `state/{brand}/` directory, стало колонка `organization_id` на всіх Supabase таблицях + окрема RLS policy на demo brand.
---

# Brand як parameter, не гілка коду

## Context

Потрібна підтримка N брендів в одному runtime (self-promo + vck заплановані, можливо більше). Два класичні підходи: (a) fork коду per brand, (b) один runtime з brand як параметром.

## Decision

Один runtime обслуговує N брендів. `brand_id` → детермінує шлях до config (`config/{brand}.yaml`) і state (`state/{brand}/`). Немає "forks" коду. Усі skills приймають `brand_id` як обов'язковий параметр.

## Alternatives considered

- **Per-brand код fork** — простіше на старті, але підтримувати N копій коду — непрактично. Кожен bug fix — N разів.
- **Single brand hardcoded** — не вирішує задачу. Рано чи пізно треба додати другий бренд.

## Reasoning

- Додати новий бренд = створити YAML + папку. Без deploy, без релізу.
- Плагін залишається single codebase при зростанні.
- Subagent prompts природньо приймають brand context через параметр.

## Trade-offs accepted

- Per-brand customization (скажімо, інший кастомний subagent) треба буде пробросити через config. v1 не потребує, може знадобитись у v1.x.

## Revisit when

- З'являється бренд який вимагає radically різної логіки (не просто різного positioning/competitors) — тоді додай `hooks/{brand}/*.md` overriding layer, але не fork'ай код.
