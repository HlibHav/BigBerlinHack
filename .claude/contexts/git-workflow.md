# Git + Dev Workflow (tiered)

> Lazy-loaded коли user prompt згадує: git, commit, push, branch, merge, PR, tier, plan, feature, refactor

## Git

**Branches:** `main` (production), `feat/{slug}`, `fix/{slug}`, `docs/{slug}`. Жодних long-lived branches окрім main.

**Commit format:** `[BBH] {imperative summary}` — максимум 72 chars subject.

```
[BBH] add Inngest morning-brief function skeleton

Створено app/api/inngest/route.ts + functions/morning-brief.ts.
Поки що emit'ить event і пише пустий run row. Step'и для
snapshot-fetch / embed / synthesize / tts — у наступному commit'і.
```

**Перед push'ем:** `pnpm typecheck && pnpm lint && pnpm test`. Якщо щось падає — не push'ай "тимчасово", виправ або відкатай commit.

**PR merge:** squash. Preserve первинну інтенцію в squash message, не фразу "fix review comments".

---

## Dev Workflow (tiered, calibrated for Opus 4.7)

**Tier 1 — Quick Fix** (single file, <20 lines, no new deps):
- Пиши inline, без plan.
- Гейт: `pnpm typecheck` після save.
- Commit одразу.

**Tier 2 — Feature** (multi-file, new Inngest function, new route, new migration):
- Спершу план: запропонуй steps у відповіді, чекай "давай" від Glib (або явного "просто роби").
- Після плану: міграцію першою (якщо є), потім types regen, потім функція, потім route, потім UI.
- Кожен логічний крок — окремий commit.
- Гейт C (code change) перед push.

**Tier 3 — Architecture** (new service, schema rewrite, cross-pipeline refactor):
- Обов'язкова запис у `decisions/YYYY-MM-DD-{topic}.md` ПЕРЕД кодом.
- Grep існуючі decisions на тему.
- Якщо superseding — update frontmatter у старому ADR + README.md index.
- Full review через Agent worktree (див. review-worktree.md).
