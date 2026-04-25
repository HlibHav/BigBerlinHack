# Brand Intelligence Agent

> Project-agnostic AI visibility system. Один config-файл на бренд — і ти маєш morning briefs, competitor radar, narrative simulation, live widgets.

**Status:** docs draft · 2026-04-24 · pre-implementation

---

## Що це

Система яка стежить як LLM-и (ChatGPT, Claude, Gemini, Perplexity, AI Mode) "бачать" твій бренд та конкурентів, і автоматично:

1. Щоранку дає голосовий/текстовий brief про зміни за добу.
2. Кожні 6 годин моніторить конкурентів по всіх джерелах і готує контр-наратив на значущі рухи.
3. On-demand тестує нові варіанти позиціонування через симуляцію LLM-запитів.
4. Віддає live віджет який можна вбудувати на сайт ("ось що ChatGPT думає про нас прямо зараз").

Архітектурно це **orchestrator skill + три sub-скіли + субагенти** поверх shared state-файлів. Не монолітний "agent", а модульна система де кожен workflow тестується і еволюціонує окремо.

**Naming note:** plugin називається `brand-intel`, скіли всередині — `check`, `morning-brief`, `narrative-simulator`, `competitor-radar`. Викликаються як `/brand-intel:check`, `/brand-intel:morning-brief`, etc.

## Для кого

Система **project-agnostic**. Конфіг BrandContext описує конкретний бренд — його позиціонування, конкурентів, tracked prompts, канали. Один runtime обслуговує N брендів (в цьому workspace це `self-promo` і майбутній `vck`).

Цільовий користувач — early-stage founder який:
- Вже має або от-от матиме публічну присутність.
- Хоче моніторити LLM-видимість без ручної роботи.
- Готовий жити в Claude Code / Cowork середовищі.

## Core loop

```
BrandContext → Scheduled runs → External data pull → Diff vs state → Summarize → Action
     ↑                                                                          ↓
     └─────────────────── Founder adjusts positioning ←─────────────────────────┘
```

Головна ідея: founder не "відкриває дашборд" — агент сам приходить до нього з трьома видами сигналів (morning brief, competitor alert, narrative test result).

## Scope

**In scope:**
- W4 Live visibility widget (embedded) — standalone JS, використовує Peec MCP через proxy.
- W5 Narrative Simulator — on-demand skill з паралельними субагентами.
- W6 Voice Morning Brief — scheduled skill, щоденний.
- W9 Competitor Move Radar + Auto Counter-Draft — scheduled skill з субагентом-на-конкурента.
- Orchestrator skill яка знає коли і що запускати.
- State layer (file-based, per-brand).
- Observability (run logs, cost tracking).

**Out of scope (v1):**
- UI/дашборд (окрім W4 widget) — весь user-facing output = текст + голос.
- Multi-tenant SaaS — це solo/team-scoped інструмент.
- Навчання власних моделей — все через LLM API + MCP.
- Content generation pipeline (окрім counter-drafts) — цим займаються інші workflows з `peec-mcp-workflows_v1.md`.
- Attribution / conversion tracking — це задача аналітики, не visibility.

## Deployment

Рекомендація — **Claude Code plugin**. Детальне обґрунтування в [ARCHITECTURE.md](./ARCHITECTURE.md#adr-001-deployment--claude-code-plugin) ADR-001. Коротко: скіли + scheduled tasks + MCP config = саме та форма для якої plugin створений.

## Документи

- [ARCHITECTURE.md](./ARCHITECTURE.md) — components, data flow, topology, ADRs, failure modes.
- [CONTRACTS.md](./CONTRACTS.md) — schemas, skill signatures, subagent prompts, external integration shapes.
- [SKILLS.md](./SKILLS.md) — per-skill specs (orchestrator + W5/W6/W9).
- [GAPS.md](./GAPS.md) — CTO-audit: security, testing, observability, cost, UX, recovery, lifecycle, multi-brand, demo contingencies.
- [CLI-TOOLS.md](./CLI-TOOLS.md) — required/recommended CLI install list (jq, yq, rg, direnv, httpie, ffmpeg, duckdb, bats, …).
- [RUNBOOK.md](./RUNBOOK.md) — operational procedures (add brand, rotate keys, debug failed run, pause agent, pre-demo checklist).
- [docs/folder-tree.md](./docs/folder-tree.md) — directory layout reference.

## Hackathon demo (2026-04-25)

Full funnel у 4 минути. Кожен крок — ≤45 секунд. Опирається на pre-seeded `config/demo-brand.yaml` + `state/demo-brand/` щоб не залежати від live API latency (детально у [GAPS.md §10](./GAPS.md#10-demo-day-contingencies-hackathon-2026-04-25)).

**Crеще storyboard:**

1. **Live LLM query (Widget W4)** — "Ось widget на сайті. ChatGPT прямо зараз бачить нас так…" Embed-JS виконує live call, показує citations + context.
2. **Voice morning brief (Telli)** — "А о 8:00 сьогодні мені дзвонив Telli. Ось запис." Програємо pre-recorded call, потім показуємо transcript у Cowork. Опціонально — live Telli call на сцені з fallback на recording якщо API впаде.
3. **Competitor radar (W9)** — "Радар зловив конкурента за останні 6 годин. Ось counter-draft." Показуємо `state/demo-brand/signals/competitors.jsonl` → `state/demo-brand/counter-drafts/...md` з timestamp = today-1h.
4. **Narrative A/B (W5)** — "Тестуємо 3 нові positioning." Запускаємо `/brand-intel:narrative-simulator demo-brand --candidates=...`, дивимось ranked output.

**Фінал (15с):** один візуальний slide "the loop": BrandContext → scheduled runs → diff → brief → founder adjusts positioning → loop. Підкреслити — це не dashboard, це **agent який приходить до тебе**.

Дет. pre-demo checklist — у [RUNBOOK.md §Pre-demo](./RUNBOOK.md#pre-demo-checklist-day-before-hackathon).

## Що не будемо робити

Навіть якщо спокусливо:
- **Один мега-агент "Brand Intelligence" з усім всередині.** Модульність. Кожен скіл окремо.
- **Real-time streaming monitoring.** Batch з розумною cadence (6h). Real-time = непотрібна вартість.
- **"AI Visibility Dashboard"** як окремий продукт. Це вже зробили Profound/Peec/MEGA AI. Ми будуємо **agentic loops** поверх їх даних, а не replica.
- **Mock Peec MCP для тестів.** Інтеграційні тести б'ють реальний MCP з dedicated test-brand. Занадто багато discovered-by-mocks багів в цьому просторі.

## Related work

- `peec-mcp-workflows_v1.md` — каталог з 12 workflows. W4/5/6/9 з нього — підмножина що реалізується тут.
- `ai-visibility-agent_trend-report_2026-04-24.md` — ринковий контекст (хто конкуренти, чому цей простір небезпечний для generic-product pitch).
