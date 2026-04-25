# BBH — Brand Intelligence Agent (webapp)

> Working memory для Claude. Slim core: завжди завантажується. Глибокі секції — у `.claude/contexts/{module}.md`, lazy-loaded через UserPromptSubmit hook based на keywords у prompt'і.

**Deadline:** hackathon demo 2026-04-25. Все нижче калібровано під цю дату і Opus 4.7.

---

## 1. Project

**Brand Intelligence Agent.** Один runtime обслуговує N брендів через `organization_id`. Чотири pipeline'и (full design):

- **W4 — Public widget.** `[FULL DESIGN — DEFERRED post-hackathon]` Embeddable iframe `/widget/{brand_id}` з живими наративами і citations.
- **W5 — Narrative simulator.** `[ACTIVE]` Генерує ranked counter-narratives на competitor moves або user-seeded prompts.
- **W6 — Morning brief.** `[FULL DESIGN — DEFERRED post-hackathon, superseded by W6′ Slack send]` Daily 08:00 local → Telli voice-agent call або TTS fallback.
- **W9 — Competitor radar.** `[ACTIVE]` Every 6h → classifies signals by severity, auto-drafts counters для `severity=high`.

### Hackathon scope (2026-04-25)

Сьогодні shippиться **W9 + W5 + W7 + W6′ + dashboard** з UX patches. **BBH = intelligence layer над Peec MCP** (data pulled через Claude Code MCP session, persisted у `data/peec-snapshot.json`). Demo brand — **Attio (vs Salesforce + HubSpot)**, готовий Peec MCP Challenge test project.

Active pipelines:
- **W9** competitor radar — Peec snapshot file + Tavily live, severity+sentiment classify, auto-draft if high.
- **W5** narrative simulator — own LLM panels, ranked variants з position/mention_rate/predicted_sentiment.
- **W7** multi-channel expand — counter-draft → 4 variants (blog/X/LinkedIn/email).
- **W6′** morning brief — daily 8am UTC text summary → real Slack webhook send.

W4 widget + W6 voice + Resend email — deferred. Decisions: `decisions/2026-04-25-mcp-only-peec-attio-demo.md` (latest, supersedes Peec REST + demo brand sections) + `decisions/2026-04-25-peec-overlay-pivot.md` (overlay vision authoritative) + `decisions/2026-04-25-hackathon-scope-cut.md` + `brand-intel/feedback/marketer-2026-04-25.md`.

Решта документації описує **повну архітектуру**. Якщо щось `[DEFERRED]` — це target post-hackathon, не current build.

Non-goals v1: paid tiers, multi-tenant admin UI, mobile apps.

**Stack (locked 2026-04-24, див. `decisions/2026-04-24-deployment-webapp.md`):**

- **Frontend:** Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui.
- **Runtime:** Vercel (edge + serverless).
- **Storage:** Supabase (Postgres + Auth + Storage + pgvector), eu-west-1 (GDPR).
- **Orchestration:** Inngest step functions.
- **External APIs hackathon-active:** **Peec snapshot file** (refresh manual via Claude Code MCP) + Tavily (live search) + OpenAI + Anthropic + Slack incoming webhook. Решта `[DEFERRED]`.
- **Validation:** Zod schemas for every agent I/O boundary.

**Public demo (hackathon):** `https://bbh.vercel.app/demo/attio` без auth. Private брендів не показуємо до post-demo.

---

## 2. Language

- **Спілкування:** українська (prose, commits bodies, ADRs, knowledge/).
- **Код, config, CLI, schemas:** англійська.
- **Commit messages:** `[BBH] short imperative — <72 chars`. Тіло commit'а — українською, prose не bullets.
- **PR descriptions:** українською; code snippets і command outputs — дослівно.

---

## 3. Scope Discipline (CRITICAL — завжди читай)

**Ти робиш те що сказано, нічого більше.** Якщо Glib сказав "додай voice fallback у morning brief" — не лізь перепроектовувати W9 паралельно.

Якщо під час роботи бачиш суміжний bug:
- Дрібний (<5 хв) — фіксуй інлайн з окремим commit'ом.
- Нетривіальний — запиши у `knowledge/hackathon-demo/hypotheses.md` або створи окреме завдання, не розширюй поточну задачу.

**Не додавай:**
- Нові dependencies без питання.
- Нові ENV vars без оновлення `.env.example`.
- Нові migrations без пояснення у commit body.
- Нові routes без посилання в UI.

---

## 4. CRITICAL zones (never edit without extra care)

- `lib/schemas/**` — агент output contract.
- `lib/events.ts` — Inngest event shapes.
- `supabase/migrations/**` — schema історія.
- `app/api/webhooks/**` — attack surface.
- `lib/supabase/rls/**` — GDPR guardrail.
- `lib/services/peec-snapshot.ts` — JSON loader для Peec data.

**При edited CRITICAL zone — обов'язковий `code-reviewer` agent run перед commit.** Деталі — `.claude/contexts/review-worktree.md`.

---

## 5. Quality Gates (1-line summary)

- **Gate A** — DB writes: Zod parse + organization_id + RLS check + no PII + evidence_refs ≥1.
- **Gate B** — Pipeline output: ≤cost envelope + brand voice + run logged.
- **Gate C** — Code/schema: typecheck + lint + test + types regen + cost track + cross-refs.
- **Gate D** — Demo readiness: див. `brand-intel/RUNBOOK.md §8`.
- **Gate E** — Docs: grep contradictions + cross-refs + ADR superseded properly.

Full criteria — `.claude/contexts/gates.md`.

---

## 6. Reference Docs

Глибока документація — `brand-intel/*.md`:

- `brand-intel/README.md` — vision, scope, demo URL.
- `brand-intel/ARCHITECTURE.md` — топологія, request flow, pipeline architecture.
- `brand-intel/CONTRACTS.md` — Zod schemas + DB schemas + API routes + webhook signatures (SSOT для shape'ів).
- `brand-intel/PIPELINES.md` — per-pipeline (W4/W5/W6/W9) steps, cost envelope, evidence requirements.
- `brand-intel/RUNBOOK.md` — deploy, migrations, rotate keys, rollback, demo-day checklist, Peec snapshot refresh.
- `brand-intel/CLI-TOOLS.md` — install prereqs + pnpm/supabase/vercel/inngest/git workflow.
- `brand-intel/GAPS.md` — known failure modes + resolutions.
- `brand-intel/features/` — per-feature requirements (`onboarding.md`, `dashboard.md`, `content-expansion.md`, `morning-brief.md`).
- `brand-intel/feedback/` — external review preserved verbatim.

**Конфлікт:** `brand-intel/{file}.md` виграє над `knowledge/{domain}/knowledge.md`. Онови `knowledge/`.

**SSOT rules:**
- DB DDL + Zod schemas → `CONTRACTS.md`.
- System topology → `ARCHITECTURE.md`.
- Per-pipeline behavior → `PIPELINES.md`.
- Per-feature UX → `features/*.md`.
- Decisions → `decisions/*.md`.

---

## 7. Context Modules (lazy-loaded via hook)

Hook `~/.claude/hooks/inject-bbh-context.sh` детектує keywords у твоєму prompt'і і інжектить тільки релевантні модулі. Доступні:

| Module | Triggers when prompt mentions |
|---|---|
| `architecture.md` | inngest, pipeline, step, function, worker, cron, event |
| `supabase.md` | supabase, migration, table, RLS, psql, seed, DDL, postgres, pgvector |
| `gates.md` | gate, готово, ready, verify, demo, dry-run, hackathon, ship |
| `review-worktree.md` | review, code-review, worktree, sub-agent, spawn, critical zone, merge, parallel agents |
| `git-workflow.md` | git, commit, push, branch, PR, tier, plan, feature, refactor |
| `audit.md` | research, decision, ADR, propose, рішення, knowledge, hypothesis, conflict |
| `verification.md` | typecheck, lint, test, vitest, playwright, coverage, e2e |
| `frontend.md` | frontend, UI, component, shadcn, page, tsx, css, tailwind, dashboard, widget, mobile |
| `data-safety.md` | secret, key, .env, credential, leak, rotate, backup, environment, node, pnpm |
| `commands-paths.md` | command, deploy, vercel, where, location, project layout, file structure |
| `cicd.md` | CI, GitHub Actions, build, preview deploy |
| `knowledge-decisions.md` | knowledge, hypothesis, decision, ADR, fact, learn, promote, supersede, history |
| `opus-notes.md` | opus, model, calibration, AskUserQuestion |

Якщо потрібен модуль не за keyword — Read його напряму з `.claude/contexts/{name}.md`.

---

## 8. Schedule (reflection cadence)

- **Щопонеділка (або кожні 5 significant sessions):** пройди по `knowledge/*/hypotheses.md` — що промотити, що видалити.
- **Перед новою фічою:** grep `decisions/` на тему — чи не конфліктуємо.
- **Після hackathon (2026-04-26):** `decisions/2026-04-26-post-hackathon-retro.md`.

Якщо >7 днів без рефлексії і накопичились hypotheses — проактивно запропонуй Glib'у consolidation.

---

## 9. Git repo

GitHub remote: `git@github.com:HlibHav/BigBerlinHack.git` (Glib створює сам). Production Vercel project linked to main.

---

**Backup:** Original 595-line CLAUDE.md preserved at `.claude/CLAUDE.md.backup` for rollback.
