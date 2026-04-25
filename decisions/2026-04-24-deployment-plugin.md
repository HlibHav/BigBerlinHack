---
date: 2026-04-24
status: superseded
topic: deployment form
supersedes: none
superseded_by: 2026-04-24-deployment-webapp.md
adr_ref: ADR-001 (brand-intel/_archive/ARCHITECTURE.md)
---

> **SUPERSEDED 2026-04-24** — plugin form не проходить hackathon criteria (no public URL, no visual impact, no webhook endpoint). Actual decision у `2026-04-24-deployment-webapp.md`.

# Deploy brand-intel як Claude Code plugin

## Context

Потрібно обрати форму упаковки для brand-intel. Проект має скіли (orchestrator + 3 workflow), scheduled tasks, MCP dependencies (Peec, Tavily, Firecrawl, scheduled-tasks), shared config/state layer. Форма має бути project-agnostic (один runtime = N брендів) і не накладати ops overhead.

## Decision

Claude Code plugin з:
- `plugin.json` манифест
- `skills/` директорія (orchestrator + W5/W6/W9)
- `scheduled-tasks.json` конфіг
- `config/_template.yaml` як reference BrandContext
- MCP dependencies declared (Peec optional, Claude required)

## Alternatives considered

- **Local skills folder** — дешевше на старті, але refactor у plugin пізніше болісно (треба переносити state, переробляти config). Раз ми project-agnostic — plugin одразу.
- **Standalone Python/TS service** — найбільший контроль, втрачаємо skills/MCP native-ness, програємо на ergonomics. Розглянути якщо plugin хтось відкине як форму (малоймовірно для solo-use).
- **Hybrid plugin + external cron service** — додає 2x complexity (два runner'и, double-run risk, секрети в двох місцях). Catch-up on first open це покриває для solo-use (див. `2026-04-24-scheduling-catchup.md`).

## Reasoning

Skills + scheduled tasks + MCP config — саме та форма, для якої plugin створений. Project-agnostic натиrally виходить (кожен plugin instance має свій `config/`). Distribution вже вбудована (якщо потім ділитись).

## Trade-offs accepted

- Більше boilerplate ніж "просто папка зі SKILL.md'ами" (~1 додатковий файл-манифест).
- Залежність від того що user відкриває Cowork достатньо часто (див. scheduling-catchup.md).

## Revisit when

- Plugin form відкинута як дистрибутивна (не станеться).
- З'явиться потреба у headless/24-7 runner'і (тоді додаємо CLI `brand-intel daemon`, не замінюємо plugin).
