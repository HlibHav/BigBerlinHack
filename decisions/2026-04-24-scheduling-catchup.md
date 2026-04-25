---
date: 2026-04-24
status: superseded
topic: scheduling mechanism
supersedes: none
superseded_by: 2026-04-24-scheduling-inngest.md
adr_ref: ADR-004 (brand-intel/_archive/ARCHITECTURE.md)
---

> **SUPERSEDED 2026-04-24** — `scheduled-tasks` MCP доступний тільки у plugin runtime. Pivot на webapp (ADR-001-R) вимагає зовнішньої orchestration. Actual decision у `2026-04-24-scheduling-inngest.md`.

# Scheduling через scheduled-tasks MCP з catch-up on first open

## Context

Потрібен mechanism для 2x scheduled workflows: `morning-brief` (daily 08:00 local) і `competitor-radar` (every 6h). Треба уникнути: cron/launchd overhead, double-run risk, необхідність headless daemon. Solo-use — Cowork відкривається мінімум раз на день.

## Decision

Єдиний механізм — `scheduled-tasks` MCP всередині Claude Code. Без cron, launchd, зовнішніх runner'ів. Якщо Cowork закритий коли настає scheduled час — task стоїть у черзі і виконується при першому відкритті ("catch-up on first open").

Для `competitor-radar` (cadence 6h) при catch-up — **один** run за missed window, не N ретро-запусків. Логіка "since > last_run_ts" захоплює весь пропущений інтервал.

## Alternatives considered

- **Cron/launchd wrapper** — окремий runner, secrets дублюються, double-run ризик. Відкинуто.
- **Hybrid plugin + external daemon** — 2x complexity, обидва runner'и активні. Відкинуто.
- **Manual trigger only** — force user ручно запускати скіли. Незручно і нівелює "agent який приходить до тебе" концепцію.

## Reasoning

- Zero ops — жодного launchd/cron, жодного зовнішнього сервера.
- Жодного ризику double-run (був би, якби cron і scheduled-tasks обидва активні).
- Весь UX через Cowork, без розривів досвіду.
- "Since last snapshot" logic робить brief актуальним навіть при catch-up delay.

## Trade-offs accepted

- Якщо Cowork не відкрито цілу добу — пропустимо один brief window. Catch-up дасть актуальний стан, але "вчорашнього ранку" brief не буде. Для solo-use прийнятно.

## Revisit when

- Founder стабільно (3+ тижні) пропускає brief cycles → додай headless runner (`brand-intel daemon` CLI).
- З'являється SLA-вимога на guaranteed delivery time → перегляд.

## Implementation note

Scheduled tasks записують `run_id` у `state/{brand}/runs/` навіть при skip через pid-lock — потрібно для `since` часу наступного запуску.
