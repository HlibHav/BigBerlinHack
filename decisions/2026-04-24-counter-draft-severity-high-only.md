---
date: 2026-04-24
status: accepted
topic: counter-draft generation policy
supersedes: none
superseded_by: none
adr_ref: `brand-intel/PIPELINES.md §W9 Competitor radar`
post_pivot_note: paths below ("state/{brand}/counter-drafts/*.md") superseded 2026-04-24 з pivot на Supabase; policy severity=high-only stays valid and maps 1:1 до таблиці counter_drafts з колонкою status.
---

# Auto-generate counter-drafts тільки для severity=high

## Context

competitor-radar скіл виявляє competitor moves і класифікує їх по severity (low/med/high). Питання: для яких severity автоматично генерувати counter-drafts? Це впливає на (a) cost — LLM calls на draft generation, (b) noise — founder перевантажений drafts, (c) quality — більше drafts = більше miss'ів.

Glib прямо вказав (2026-04-24): counter-drafts лише для `severity=high`.

## Decision

- `severity=high` → автоматична генерація counter-draft у `state/{brand}/counter-drafts/*.md` зі `status: draft`.
- `severity=med` → signal logged у `state/{brand}/signals/competitors.jsonl` з `auto_draft: false`. Draft не генерується.
- `severity=low` → тільки logged. Draft не генерується.

Усі drafts — завжди `status: draft` на старті. Publishing — manual approval через frontmatter edit (`status: approved`) + ручний post у X/LinkedIn.

## Alternatives considered

- **Draft для med + high** — дублюємо cost, founder розчиняє увагу. Відкинуто.
- **Auto-publish для high** — ризик tone mismatch, legal issues. Відкинуто — немає human-in-loop.
- **Draft для всіх signals включно з low** — overwhelm, cost.
- **Manual trigger only** — нівелює "agent який приходить до тебе" для counter-moves.

## Reasoning

- Cost discipline — drafts на med signals більшість часу нікому не потрібні.
- Quality concentration — LLM focus на important signals.
- Founder attention — high signals усього декілька на тиждень, легко перевірити і затвердити.

## Trade-offs accepted

- Med signals можуть містити корисні counter-opportunities які ми proactive не використовуємо. Mitigation: founder може manually попросити draft для med signal через `narrative-simulator` з signal як seed.
- Severity classification має бути точною. Якщо miss-class'и (high → med) будуть часті — втрачаємо drafts. Відслідковуємо через GAPS.md §2 integration tests з human review.

## Revisit when

- >20% med signals post-hoc класифіковані як "мали стати drafts" → підвищити threshold.
- Severity misclassification >20% → перейти на rule-based + LLM fallback класифікацію.
- З'являється capacity перевіряти med drafts без overwhelm → розширити policy.
