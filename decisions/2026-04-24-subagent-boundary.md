---
date: 2026-04-24
status: accepted
topic: subagent spawn boundary
supersedes: none
superseded_by: none
adr_ref: ADR-003 (brand-intel/ARCHITECTURE.md)
---

# Субагент тільки при виконанні трьох критеріїв

## Context

Є спокуса "розбити скіл на субагентів" кожного разу коли з'являється підзадача. Це дає ілюзію модульності, але роздуває context cost (кожен subagent має свій context window) і ускладнює debug.

## Decision

Субагент спавнимо тільки коли **виконуються всі три критерії**:
1. **Паралельність:** підзадачі виконуються одночасно і виграш від parallelism значущий.
2. **Context bloat:** якщо inline — parent skill context забруднюється великим amount низького-рівня даних які parent'у не треба для подальшої роботи.
3. **Self-contained prompt:** subagent має чіткий I/O контракт, може бути написаний як окремий артефакт і reused.

В іншому випадку — inline в parent скіл.

## Alternatives considered

- **Default subagent (modular style)** — кожна підзадача = свій subagent. Більш модульно на око, але в 2-3x дорожче через дублювання context + harder trace.
- **No subagents взагалі** — все inline. Губимо параллелізм (competitor radar парсить 10 конкурентів послідовно замість парало) і контекст роздувається.

## Reasoning

Дефолт до inline дає cost savings і простіший trace. Три критерії — фільтр що пропускає лише дійсно виправданих кандидатів (зараз це: per-competitor scan у W9, per-narrative generation у W5).

## Trade-offs accepted

- Треба дисципліна — легко "розбити бо красиво". Правило: default to inline, вимагай justification для subagent.

## Revisit when

- Parent context починає стабільно перевищувати ліміт → подивись які inline шматки можна винести у subagent.
- Subagent пишеться для одноразового парсингу без reuse — redact до inline.
