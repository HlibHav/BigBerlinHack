# Gaps audit

> Речі яких ще немає у README / ARCHITECTURE / CONTRACTS / SKILLS, але мають бути до того як ми почнемо код на хакатоні. Кожен розділ — виявлений gap + resolution, готовий до матеріалізації у відповідний doc.

**Читається разом з:** [ARCHITECTURE.md](./ARCHITECTURE.md), [CONTRACTS.md](./CONTRACTS.md), [SKILLS.md](./SKILLS.md).

**Status:** audit draft · 2026-04-24

---

## Чому цей документ існує

Після трьох pass'ів над основними docs у нас є: vision, entity model, agent topology, schemas, per-skill specs. Але якщо сісти писати код — натрапимо на pit-falls які замалюють півдня. Цей аудит йде по кожному і каже: "ось рішення, ось де у схемі воно живе, ось куди переїде після хакатона". Після audit'у жодна категорія не має залишатись "it depends".

Категорії:
1. Secrets & security
2. Testing strategy
3. Observability & debugging
4. Cost enforcement
5. Onboarding UX
6. Error recovery & kill switches
7. Plugin lifecycle
8. Content quality
9. Multi-brand concurrency
10. Demo-day contingencies
11. What we deliberately defer

---

## 1. Secrets & security

### Gap
Жоден з docs не каже **як саме** API keys Peec/Tavily/Firecrawl/Claude/Telli потрапляють у runtime. `config/_template.yaml` посилається на `api_key_env: TAVILY_API_KEY`, але не пояснено де цей env живе.

### Resolution
**Default storage:** `.env` у корені плагіна + `direnv` hook. `.env.example` у repo, справжній `.env` у `.gitignore`.

```
brand-intel/.env.example    # committed, має всі необхідні ключі з плейсхолдерами
brand-intel/.env            # gitignored, реальні ключі
```

**Load order:** `direnv allow` у plugin-root → env змінні інжектяться у shell → скіли читають через `os.environ[...]` (Python) або `process.env[...]` (Node).

**Rotation:** `brand-intel:rotate-secrets` допоміжний скіл (v2) відкриває dashboard'и провайдерів і нагадує. Для v1 — documentation only у RUNBOOK.md.

**Per-brand keys:** якщо дружня команда захоче inший Peec-акаунт — `config/{brand}.sources.peec.project_id` + окремий env `PEEC_API_KEY_{BRAND_UPPER}`. Код шукає спершу brand-specific, потім fallback на generic. Додається у CONTRACTS.md §1 як поле `api_key_env_override`.

**Audit log:** всі external calls пишуть `ok` / `error_code` у `runs/*.jsonl` — якщо ключ відвалився, видно одразу.

**What's NOT in scope:** вільний vault (1Password, HashiCorp Vault). Для solo-use overkill. Хочеш = op CLI інтеграція у v2.

### Where it lives after hackathon
- ARCHITECTURE.md §6 — новий абзац "Secrets"
- RUNBOOK.md — "Rotate API keys" runbook
- `.env.example` — новий файл у repo

---

## 2. Testing strategy

### Gap
SKILLS.md каже "інтеграційні тести б'ють реальний MCP" (README §"Що не будемо робити"), але немає 3-layer breakdown, ні dedicated test-brand спеки.

### Resolution
**3-layer piramid:**

| Layer | Що перевіряє | Інструмент | Cost |
|---|---|---|---|
| Schema validation | Всі writes у `state/` відповідають JSON Schema з `contracts/*.schema.json` | `ajv` CLI у pre-commit hook | Zero external |
| Smoke tests | Kожен скіл запускається end-to-end з `dry_run: true` → no external calls, використовує fixtures з `tests/fixtures/` | `bats` (bash-based, бо скіли = bash + claude -p invocations) | Zero external |
| Integration tests | Реальний Peec/Tavily hit через dedicated `test-brand` config | CI matrix (manual trigger only) | ~$0.20/run |

**Dedicated test-brand:**
```
config/test-brand.yaml   # реальний бренд з 2 prompts, 1 competitor
```
Prompts і competitor підібрані так, щоб їх результат був передбачувано стабільний за 7 днів (напр. тестовий topic з малим noise).

**Fixtures:** `tests/fixtures/peec-response-{scenario}.json` — snapshot'и реальних Peec-відповідей, scrubbed від PII. Використовуються smoke-layer'ом.

**CI:** schema + smoke у кожному commit. Integration — manual `make test-integration` + щотижневе scheduled.

**Contract tests for external APIs:** `docs/integrations/peec-mcp-shape.md` має "live shape snapshot" — ми вручну раз на тиждень робимо один call і порівнюємо з нашим очікуваним shape'ом. Якщо Peec drift'нув — fail. Це дешева страховка від silent breakage.

### Where it lives
- New file: `tests/README.md` — test strategy
- RUNBOOK.md — "Run smoke tests" + "Run integration tests"
- `.github/workflows/ci.yml` — схеми + smoke
- New config: `config/test-brand.yaml`

---

## 3. Observability & debugging

### Gap
ARCHITECTURE.md §8 описує run-event-log format, але не показано: як їх читати (CLI), як debug'ити failed run, як виявити аномалію без ручного пошуку.

### Resolution
**CLI view:**
```
brand-intel logs --brand self-promo --since 24h
brand-intel logs --run-id {run_id}           # показати full trace
brand-intel logs --skill competitor-radar --errors
```
Це bash wrapper що робить `jq` фільтри по `state/{brand}/runs/*.jsonl`. Реалізується за 30 хв.

**Weekly anomaly detection:**
- Roll-up скіл (згадано у ARCHITECTURE §8) обчислює: % успішних runs, avg tokens/run, avg wall-time.
- Якщо будь-яка метрика виходить за 2σ від 30-day baseline — flag у weekly summary.
- У v1 — просто markdown за тиждень у `state/{brand}/runs/weekly-summary-{week}.md`. Моніторинг — людиною.

**Replay:**
- Кожен run пише `inputs.json` у `runs/{run_id}/` (не просто jsonl) коли є non-trivial input.
- `brand-intel replay {run_id}` перезапускає з тим самим input'ом. Корисно для дебагу skill-логіки.
- Для v1: тільки за флагом `--dry-run` щоб не спалити quota на повторний радар.

**Cowork dashboard:** artifact (HTML) який читає state і рендерить table ostatніх runs з filter'ами. Опціонально. Якщо час на хакатоні дозволить — це хороший "bonus" артефакт.

### Where it lives
- ARCHITECTURE.md §8 — додати "Reading logs" підпункт
- New skill: `skills/logs/` (v1.1, не для хакатона)
- RUNBOOK.md — "Debug a failed run"

---

## 4. Cost enforcement

### Gap
`cost_envelope` у SKILLS.md формулює ліміти, але хто їх enforcing'ує? І як ми дізнаємось що 80% weekly MCP budget використано?

### Resolution
**Budget tracker:**
- File: `state/{brand}/cost-ledger.jsonl`
- Кожен external call апендить: `{ts, system, skill, run_id, units, est_usd}`
- `units` = Peec credit / Claude token / Tavily query.

**Enforcement layer (pre-call, not post-call):**
- Перед кожним external call скіл питає `check_budget(system, run_id)` → повертає `{allowed: bool, remaining_units, reason}`.
- Якщо `remaining < 20% weekly budget` → degraded mode (див. ARCHITECTURE §6).
- Якщо `remaining == 0` → `allowed: false`, скіл використовує cache або fail'ить з clear reason.

**Prompt caching (Claude):**
- Всі Claude-calls з великим static context (напр. BrandContext dump) використовують anthropic prompt caching (`cache_control`).
- Expected saving: ~40% tokens на repeat calls (судження у W5, severity у W9).
- Спец cache-key per brand+skill, не shared між брендами.

**Weekly budget reset:**
- Cron-like trigger: понеділок 00:00 local TZ → roll ledger у `cost-ledger/{week}.jsonl`, reset counter.
- Або проактивний check: "якщо last roll >7d ago — roll now".

**Hard kill switch:**
- `config/{brand}.scheduling.quotas.hard_kill_usd_per_week = 10` (default).
- Якщо tracker бачить цю суму overshoot — scheduled tasks auto-disable. Orchestrator повідомляє founder'а через notif "Budget hit, review ledger before re-enabling."

### Where it lives
- ARCHITECTURE.md §6 — розширити "Peec MCP quota budgeting" до generic cost enforcement
- CONTRACTS.md — нова схема §11 "CostLedger" entry
- SKILLS.md — додати `check_budget` як pseudo-function кожному скілу

---

## 5. Onboarding UX

### Gap
"Система project-agnostic, один config на бренд" — але як Glib **фактично** запустить це на новому бренді? Написати 10-15 tracked prompts руками — це роботи на годину і купа incorrect-рішень.

### Resolution
**`brand-intel:suggest-prompts` helper skill:**
- Input: `brand_id`, `positioning` text (з config або ad-hoc)
- Process: Claude згенерує 15 candidate prompts для 3 categories (direct/category/problem-frame)
- Output: markdown list який founder може cut-paste у config.

**`brand-intel:suggest-competitors` helper skill:**
- Input: `brand_id`, `positioning`
- Process: Tavily search "alternatives to {brand}" + "{category} companies" → dedup → top-5
- Output: YAML stub готовий для `tracked_competitors:`.

**`brand-intel:init` bootstrap wizard (v1.1, не блокує MVP):**
- Interactive: задає N питань, збирає у `config/{brand}.yaml`.
- Викликає `suggest-prompts` і `suggest-competitors` автоматично.
- Запускає перший `morning-brief --dry-run` щоб верифікувати setup.

**Cold-start brief:**
Перший brief НЕ буде diff'ити — немає baseline. Треба чесно показати це:
> "Cold start — baseline being captured. Meaningful brief starts tomorrow."
Вже згадано у SKILLS.md §2 failure modes, але треба додати explicit message template у `_prompts/brief-cold-start.md`.

### Where it lives
- New skills: `skills/suggest-prompts/`, `skills/suggest-competitors/`, `skills/init/`
- RUNBOOK.md — "Onboard a new brand" procedure
- README.md — "Quick start" section (v1.1)

---

## 6. Error recovery & kill switches

### Gap
SKILLS.md говорить "subagent timeout, parent continues" — ок. Але: що як subagent повертає малформат JSON? Як вимкнути весь радар на час (travel, vacation)? Що після crash — як відновитись?

### Resolution
**Malformed subagent output:**
- Parent використовує strict JSON Schema validation (`contracts/*.schema.json`).
- При невалідному output: спроба #1 — попросити subagent re-emit (передаємо йому error). Спроба #2 — skip, log `schema_violation` у signal.errors. Не більше 2 спроб — інакше бесконечний цикл.

**Global pause:**
- `config/{brand}.scheduling.paused_until: 2026-05-01` — коли встановлено, всі scheduled skills exit'ять на entry.
- CLI shortcut: `brand-intel pause --brand self-promo --until 2026-05-01`
- Notifications продовжуються (manual runs і on-demand), тільки scheduled спить.

**Crash recovery:**
- Pid-lock (§4 ARCHITECTURE) протухає через 30 хв. Якщо стара lock — beрусь її, log `stale_lock_recovered`.
- Append-only лог означає: можна відновити з останнього записаного snapshot'а без data loss.
- Partial writes: скіли пишуть у temp-файл (`{path}.tmp`), потім rename — atomic на POSIX.

**Kill switch на весь plugin:**
- `config/_global.yaml.disabled: true` — якщо є цей файл, plugin caches no-op для всіх trigger'ів. Аварійний brake.

**Dry-run mode:**
- Кожен скіл приймає `dry_run: true` → виконує весь flow окрім writes і external calls. Використовується для debug/verification.

### Where it lives
- ARCHITECTURE.md §7 "Failure modes" — розширити до кожного пункту
- RUNBOOK.md — "Pause/resume the agent", "Recover from a crashed run"

---

## 7. Plugin lifecycle

### Gap
Plugin оновлюється — що з state? Що з config? Як handl'имо schema migrations?

### Resolution
**SemVer discipline:**
- `plugin.json.version = MAJOR.MINOR.PATCH`
- MAJOR bump = breaking change у config format or state schema
- MINOR = new skill / additive field
- PATCH = fixes

**Plugin update НІКОЛИ не чіпає state/:**
- Всі writes у `state/` — з коду скілів, не з install hooks.
- `state/` має `.version` файл з plugin version на час першого запуску. Скіли порівнюють цю версію зі своєю → якщо breaking-gap → show migration hint, exit gracefully.

**Schema versioning per entity (вже у ARCHITECTURE §2):**
- Кожен JSONL/JSON запис має `schema_version: N`
- Reader accepts current N і N-1. Якщо запис старіший — ignore з warning.
- Writer завжди пише current. Ніколи не переписуємо старі — append-only.

**Breaking migration procedure (коли зрозуміємо що треба):**
1. Написати `scripts/migrate-v{X}-to-v{Y}.ts` — стандартизоване API, вхід = старий state, вихід = новий у `state-v{Y}/`.
2. User запускає manually. Ми НЕ автомігруємо.
3. Після migration — `mv state state-backup-v{X} && mv state-v{Y} state`.

**Config backward compat:**
- Нові поля у BrandContext додаються з default values.
- Видалені поля — принаймні 1 minor deprecation period (log warning, not error).

### Where it lives
- New file: `brand-intel/CHANGELOG.md`
- New file: `brand-intel/docs/migrations.md`
- README.md — "Updating the plugin" section

---

## 8. Content quality (tone, length, safety)

### Gap
Counter-drafts і voice scripts — це LLM-згенерований контент який може вийти off-brand, занадто довгий, або містити PII.

### Resolution
**Voice script hard limits:**
- `morning-brief-voice.txt` MUST bути ≤ 200 words (~90s speech rate).
- Skill-level check: якщо >200 — re-generate з instruction "shorter". Якщо все ще >200 — truncate останнє речення і log warning.

**Tone check (counter-drafts):**
- Вже є у SKILLS.md §4 через `forbidden_phrases`/`forbidden_patterns`.
- Розширення: опційно інтегрувати `marketing:brand-review` skill з іншого плагіна — він робить severity-aware grading проти brand guidelines (voice, terminology).
- Якщо `marketing:brand-review` недоступний → fallback на лише simple phrase match.

**PII scrubbing:**
- Всі outputs проходять regex-scrub перед write:
  - Email: `[a-z0-9._%+-]+@[a-z0-9.-]+` → `[email]`
  - Phone: стандартні паттерни → `[phone]`
- НЕ для all writes — тільки для outputs які можуть піти у publish (counter-drafts, brief public sections).
- Source/raw responses scrub'ять тільки на request (privacy-first для reports, не для debug).

**Claim verification (counter-drafts):**
- Counter-draft зобов'язаний містити source link (urls що з'явилися у competitor signal).
- Якщо draft generates claim без source у ньому → tone_check_passed: false, flagged для manual review.
- Це захист від LLM-hallucinated stats у сгенерованих постах.

### Where it lives
- CONTRACTS.md §5 "Counter-draft" — додати `tone_check_details` sub-schema
- CONTRACTS.md §6 "Brief" — додати "length_check_passed" поле
- SKILLS.md §2 + §4 — додати ці checks у Step 'Render'
- New: `skills/_prompts/counter-draft-with-sources.md`

---

## 9. Multi-brand concurrency

### Gap
README говорить "один runtime N брендів", але ARCHITECTURE §4 каже "pid-lock per brand". А як щодо **cross-brand** cost budget? Shared Peec quota якщо обидва бренди на one account?

### Resolution
**Per-brand pid-lock:**
- Вже є: `state/{brand}/.lock`. Locks незалежні — `self-promo` і `vck` можуть запускатись паралельно.

**Shared quota caveat:**
- Якщо обидва бренди на одному Peec project_id — quota shared.
- Default behavior: ledger.jsonl per-brand, але `weekly_mcp_budget` config per-brand має sum'итись розумно (жаден бренд не повинен бачити >50% total).
- Додамо у CONTRACTS §1: `brand.scheduling.quotas.shared_quota_group: "peec-main"` — якщо два бренди мають один group, enforcement layer ділить weekly_mcp_budget автоматично.

**Cross-brand orchestration:**
- НЕ плануємо. Кожен бренд = свій world. Орchestrator працює на рівні one brand.
- Якщо колись треба "порівняй two brands side-by-side" — це окремий skill, не core loop.

**State isolation:**
- Жоден скіл не читає з `state/{other-brand}/`. Якщо якийсь тест знайде такий cross-read — fail test.
- Просте enforcement: input `brand_id` формує префікс path, скіли ніколи не hardcode'ять шлях.

### Where it lives
- ARCHITECTURE.md §4 — додати "Cross-brand" параграф
- CONTRACTS.md §1 — поле `shared_quota_group`

---

## 10. Demo-day contingencies (hackathon 2026-04-25)

### Gap
Demo = full funnel (W4 widget → W6 voice brief → W9 radar detection → W5 narrative A/B). Це амбіційно. Що як Peec MCP rate-limit'ить посеред демо? Що як Telli не додзвониться?

### Resolution
**Seeded demo data:**
- `config/demo-brand.yaml` — окремий bran з preheated state:
  - `state/demo-brand/snapshots/` — 3 дні pre-captured snapshots
  - `state/demo-brand/signals/competitors.jsonl` — 2 pre-seeded "fresh" signals (timestamp = today-1h)
  - `state/demo-brand/counter-drafts/` — 1 pre-generated draft
- Це означає: demo не залежить від live LLM calls. Можемо тригерити кожен скіл у режимі "use recent state, don't refresh".

**Demo mode flag:**
- Глобальний `--demo` flag на всіх скілах.
- У demo mode: всі external calls повертаються з `state/demo-brand/fixtures/` замість реальних endpoint'ів.
- Таймінги штучні (sleep 2s для drama), output renders ідентично.

**Live element:**
- Один live call — ChatGPT/Claude query для widget W4. Це дешево, impact великий. Якщо LLM-API недоступний — widget показує last cached state з timestamp.

**Telli demo:**
- Pre-record одну call (2026-04-24 evening) з реальним voice-agent flow — якщо live Telli падає, програємо запис.
- Live attempt один раз. Failure-safe: fallback → macos-say reads script → success.

**Presenter laptop setup:**
- Offline-first: всі dependencies installed + tested на конкретному MacBook.
- Disable auto-update'ів на day-of.
- Backup internet: phone hotspot.

**"Wow moment" storyboard:**
1. "Тут widget на сайті, ось що ChatGPT думає про нас ЗАРАЗ" (live)
2. "А ось Telli мені дзвонив о 8:00, ось запис розмови" (voice)
3. "А ось competitor рухнувся за 6 годин, ось counter-draft готовий до posting" (radar)
4. "А тепер тестуємо три нові positioning — дивимось який краще ловиться" (narrative)
Кожна частина — ≤45 секунд. Total demo ≤ 4 хв.

### Where it lives
- New file: `brand-intel/demo/README.md` з presenter script
- New file: `config/demo-brand.yaml`
- `brand-intel/demo/fixtures/` — pre-captured data

---

## 11. What we deliberately defer (v2+)

Явно виписуємо щоб не було tempt'ації робити на хакатоні:

| Feature | Reason deferred |
|---|---|
| Real-time streaming visibility monitor | Expensive, low marginal value vs 6h cadence |
| Own trained ranking model | We're orchestration, not ML |
| Multi-tenant SaaS | Solo/team tool, not a SaaS pivot |
| Mobile app for brief | Voice call via Telli replaces this use-case |
| Attribution/conversion tracking | Analytics domain, not visibility |
| Auto-publish counter-drafts to X/LinkedIn | Draft-only, founder approves — safety over speed |
| Cross-brand comparison/benchmarking | Different product (industry benchmark tool) |
| Localized prompts (RU/UA/EN variants auto-generated) | Config-level для now, auto-gen пізніше |
| Historical backfill of Peec data | Start fresh at install, no import |
| A/B testing narrative on live site | Separate MarTech product |

Ці речі потрапляють у `docs/roadmap.md` (створимо post-hackathon). Кожна має "дзвінок перед додаванням" — clear criteria що мусить тригернути рішення.

---

## Що ми ще не вирішили (real open, не deferred)

1. **Де живе widget W4 backend proxy?** Vercel edge function? Cloudflare worker? Localhost тільки для demo? Не блокує хакатон (використовуємо localhost), але до публікації треба вирішити.
2. **Чи робимо ми public registry скілів** що дозволяє інший founder install'ити `brand-intel-plugin` з marketplace? Потенційно хороший distribution, але вимагає окремої роботи з Anthropic's registry.
3. **Брендинг агента самого по собі.** "Brand Intelligence Agent" — descriptive. Чи потрібна назва (продукт)? Для хакатону descriptive ок, для launch — треба.

Ці три — не блокують hackathon MVP.
