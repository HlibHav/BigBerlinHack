# Architecture

> Як воно влаштоване всередині. Цей документ читається разом з [CONTRACTS.md](./CONTRACTS.md) де лежать конкретні схеми.

---

## 1. Огляд

Brand Intelligence Agent — це набір **скілів** поверх **файлового state'у**, дехто з них запускається **за розкладом**, дехто **on-demand**, а "важку" роботу роблять **субагенти** з ізольованим контекстом. Все це керується одним **BrandContext** config-файлом на бренд.

Ключові архітектурні принципи:

1. **State живе у файлах, не в пам'яті агента.** Будь-який скіл можна убити посеред запуску, перезапустити, і він продовжить з того місця де зупинився.
2. **Agent = recipe + state + scheduling.** Немає довгоживучого "процесу агента". Є скіли які читають state, щось роблять, оновлюють state.
3. **Субагенти — це tool, не архітектурний layer.** Спавнимо коли є паралелізм або контекст роздувається. Не спавнимо для elegance.
4. **Brand is a parameter.** Той же набір скілів працює для `self-promo` і для `vck`. Відрізняє їх тільки `brand_id` у config і окрема state-папка.
5. **Graceful degradation over correctness.** Якщо Peec MCP впав — brief все одно виходить, просто з поміткою "quota-limited". Тиша гірша за неповний сигнал.

## 2. Entity model

Шість core-сутностей. Детальні схеми — у [CONTRACTS.md](./CONTRACTS.md).

| Entity | Що це | Де живе |
|---|---|---|
| `BrandContext` | Config бренду: позиціонування, конкуренти, prompts, канали | `config/{brand}.yaml` |
| `VisibilitySnapshot` | Point-in-time знімок citations зі всіх LLM-ів | `state/{brand}/snapshots/{ts}.jsonl` |
| `CompetitorSignal` | Детектована зміна у конкурента (new citation / blog / tweet) | `state/{brand}/signals/competitors.jsonl` |
| `NarrativeCandidate` | Варіант позиціонування з результатами тесту | `state/{brand}/narratives/{id}.json` |
| `CounterDraft` | Auto-згенерована відповідь на competitor move | `state/{brand}/counter-drafts/{ts}-{sig-id}.md` |
| `Brief` | Щоденний morning brief (текст + voice script) | `state/{brand}/briefs/{YYYY-MM-DD}.md` |

Всі entity мають `created_at`, `source_run_id` (для трасування) і `schema_version`. Коли схема міняється — bump версію, старі файли не мігруються (append-only лог, мінорна еволюція).

## 3. Agent topology

```
                    ┌─────────────────────┐
                    │ brand-intel:check   │  ← orchestrator skill (optional layer)
                    │ (orchestrator)      │     "check overall state"
                    └──┬────────┬──────┬──┘
                       │        │      │
          ┌────────────┘        │      └────────────┐
          ▼                     ▼                   ▼
   ┌─────────────┐     ┌─────────────┐      ┌──────────────┐
   │ morning-    │     │ narrative-  │      │ competitor-  │
   │ brief (W6)  │     │ simulator   │      │ radar (W9)   │
   │             │     │ (W5)        │      │              │
   │ SCHED daily │     │ ON-DEMAND   │      │ SCHED 6h     │
   └──────┬──────┘     └──────┬──────┘      └──────┬───────┘
          │                   │                    │
          │                   ▼                    ▼
          │         ┌───────────────────┐  ┌──────────────────┐
          │         │ N × subagents     │  │ 1× subagent per  │
          │         │ (one per variant) │  │ competitor       │
          │         └───────────────────┘  └──────────────────┘
          │                   │                    │
          ▼                   ▼                    ▼
   ┌────────────────────────────────────────────────────┐
   │              FILE-BASED STATE LAYER                 │
   │  config/  snapshots/  signals/  narratives/         │
   │  counter-drafts/  briefs/  runs/                    │
   └────────────────────────────────────────────────────┘
          ▲                   ▲                    ▲
          │                   │                    │
   ┌──────┴───────┐    ┌──────┴───────┐    ┌───────┴───────┐
   │ Peec MCP     │    │ Tavily       │    │ Firecrawl     │
   │ (primary)    │    │ (web news)   │    │ (scraping)    │
   └──────────────┘    └──────────────┘    └───────────────┘
                              │
                       ┌──────┴────────┐
                       │ Gradium TTS   │
                       │ (voice out)   │
                       └───────────────┘

W4 (live widget) — окремо. Standalone JS на сайті, б'є Peec MCP через server-side proxy.
```

### Три рівні абстракції

**Level 1 — Orchestrator skill (`brand-intel:check`)** — найвищий рівень. Викликається коли founder каже "check how we're doing" без конкретики. Читає state, вирішує який sub-скіл доречний, або просто summarizes recent state. Опціональний layer — кожен sub-скіл можна викликати напряму.

**Level 2 — Sub-skills (W5, W6, W9)** — рецепти workflows. Stateless самі по собі, читають/пишуть state через контракти. Кожен скіл має одну відповідальність і один трігер.

**Level 3 — Subagents** — worker контексти. Не мають доступу до повного state, отримують self-contained brief, повертають структурований output. Паралелізм тут.

### Коли саме спавнимо субагент

Критерії (всі три мають виконатись):
1. Робота **natively parallel** (кожен worker не залежить від інших).
2. Parent context **роздувається** якщо робити inline (>10K tokens).
3. Worker **не потребує повного brand state** — тільки self-contained brief.

W5 ✅ (варіанти narrative паралельні, кожен варіант = N Peec-запитів = роздує, worker знає тільки про свій варіант).
W9 ✅ (конкуренти незалежні, кожен = 3-4 джерела сканувати = роздуває, worker знає тільки про свого конкурента).
W6 ❌ (single-pass, малий контекст, потребує повного recent state для diff'у).

## 4. State layer

```
brand-intel/
├── config/
│   ├── self-promo.yaml
│   ├── vck.yaml
│   └── _template.yaml          # reference BrandContext schema
├── state/
│   ├── self-promo/
│   │   ├── snapshots/          # append-only, one file per capture
│   │   │   └── 2026-04-24T08-00-00Z.jsonl
│   │   ├── signals/
│   │   │   └── competitors.jsonl  # append-only event log
│   │   ├── narratives/
│   │   │   └── {candidate-id}.json
│   │   ├── counter-drafts/
│   │   │   └── {ts}-{sig-id}.md
│   │   ├── briefs/
│   │   │   └── 2026-04-24.md
│   │   ├── runs/               # observability
│   │   │   └── {run-id}.jsonl
│   │   └── cache/
│   │       └── peec/           # TTL'd response cache
│   └── vck/ ...
├── skills/                     # SKILL.md per workflow
├── contracts/                  # JSON Schema files referenced from CONTRACTS.md
└── docs/
```

### Write semantics

- **Append-only логи** (`snapshots/`, `signals/competitors.jsonl`, `runs/`) — нові записи завжди в хвіст, старі ніколи не переписуються. Це і immutable audit trail, і trivial crash recovery.
- **Point-in-time артефакти** (`briefs/`, `counter-drafts/`, `narratives/`) — один запис одному файлу, дата в імені. Перезаписати — означає втратити контекст, роби нову версію з `-v2` суфіксом.
- **Config** (`config/*.yaml`) — людина редагує вручну. Скіли тільки читають.
- **Cache** (`cache/peec/`) — TTL 24h, content-hashed by prompt. Знести цілу папку безпечно.

### Concurrency

Припущення — у нас максимум одна instance агента на бренд запущена в кожен момент. Якщо scheduled task потрапить під on-demand виклик — pid-lock файл у `state/{brand}/.lock`, скіл чекає до 5с, потім skip (логує і вмирає тихо). Для solo-use цього вистачить.

## 5. Scheduling

Три режими трігерів:

| Trigger | Skill | Cadence |
|---|---|---|
| Scheduled | `morning-brief` | Daily 08:00 local TZ |
| Scheduled | `competitor-radar` | Every 6h, offset :15 (08:15, 14:15, 20:15, 02:15) |
| On-demand | `narrative-simulator` | Triggered by founder (Cowork/CLI invocation) |
| On-demand | `brand-intel:check` (orchestrator) | "check our visibility state" phrase |

Механізм: Claude Code plugin `scheduled-tasks` MCP (вже є в toolbelt). Без зовнішнього fallback — див. ADR-004. Якщо Cowork закритий коли настає час — task виконується при першому відкритті ("catch-up on first open").

## 6. External dependencies

| System | Role | Criticality | Fallback |
|---|---|---|---|
| Peec MCP | Primary visibility data (5+ LLMs) | Hard — без нього немає core value | Use cached snapshot ≤24h old; mark brief as "quota-limited" |
| Tavily | Web/news search for competitor moves | Soft | Skip news channel in radar, continue with Peec-only signals |
| Firecrawl | Scraping competitor sites/blogs | Soft | Skip scraping channel, flag in signals |
| Gradium (TTS) | Voice output for morning brief | Nice-to-have | Text-only brief, log "voice generation failed" |
| Claude API | LLM for drafts/summaries/ranking | Hard | No fallback — якщо це впало, нічого не працює |

**Peec MCP quota budgeting** — чутливе місце. Кожен workflow має `cost_envelope.mcp_calls_max`. Orchestrator tracks actual usage у `runs/*.jsonl`. Якщо тижневий budget >80% використано — orchestrator перемикає на degraded mode (W9 стає daily замість 6h, W5 відмовляється запускатись до наступного reset).

## 7. Failure modes

Для кожного workflow описано в SKILLS.md. Загальні правила:

1. **Fail loud, act quiet.** Помилки логуються з повним context у `runs/*.jsonl`, але user-facing output ніколи не крашиться — degraded output краще за null.
2. **Every external call retries 2x with exponential backoff.** Після — caching або skip, залежно від criticality.
3. **Subagent timeout = 5min default.** Parent продовжує з partial результатами, недоукомплектовані workers помічаються у output.
4. **Schema drift** у відповіді MCP — ловимо, логуємо raw response, fallback to "unparseable source", і створюємо задачу у inbox на ручний debug.

## 8. Observability

Кожен run генерує рядок у `state/{brand}/runs/{YYYY-MM-DD}-{run-id}.jsonl` з подіями:

```
{ts, event: "run_start", skill: "...", trigger: "scheduled"|"on-demand", brand, run_id}
{ts, event: "external_call", system: "peec"|..., ok: true|false, duration_ms, cost_units}
{ts, event: "subagent_spawn", subagent_id, purpose, input_size}
{ts, event: "subagent_return", subagent_id, ok, output_size, tokens_used}
{ts, event: "write", path, bytes}
{ts, event: "run_end", ok, duration_ms, tokens_total, mcp_calls_total}
```

Через тиждень roll-up скіл згортає щоденні `runs/*.jsonl` у `state/{brand}/runs/weekly-summary.md` — скільки запусків, % успішних, куди йдуть tokens/credits. Це опціонально, не блокує MVP.

---

## ADRs

### ADR-001 Deployment — Claude Code plugin

**Status:** Proposed · 2026-04-24

**Context:** Потрібно обрати форму упаковки. Варіанти: plugin, local skills, standalone service, hybrid.

**Decision:** Claude Code plugin з:
- `plugin.json` манифест
- `skills/` директорія (orchestrator + W5/W6/W9)
- `scheduled-tasks.json` конфіг
- `config/_template.yaml` як reference BrandContext
- MCP dependencies declared (Peec optional, Claude required)

**Consequences:**
- ✅ Project-agnostic natively — кожен plugin instance має свій `config/`
- ✅ Distributable — якщо захочеться поширити чи продати, пакування вже є
- ✅ Скіли + scheduled tasks = саме та форма для якої plugin створений
- ✅ MCP integration native, не треба власний SDK wrapper
- ❌ Більше boilerplate ніж "просто папка зі SKILL.md'ами"
- ❌ Залежність від того що user відкриває Cowork достатньо часто (catch-up on first open — див. ADR-004)

**Alternatives considered:**
- **Local skills folder** — дешевше на старті, але рефакторити у plugin пізніше болісно (треба переносити state, переробляти config). Раз ми project-agnostic — plugin одразу. Якщо не впевнений — плагін це по суті "папка з маніфестом", overhead ~1 файл.
- **Standalone Python/TS service** — найбільший контроль, втрачаємо skills/MCP native-ness, програємо на ergonomics. Розглянути якщо plugin хтось відкине як форму (малоймовірно для solo-use).
- **Hybrid plugin + external cron service** — відкинутий. Додає 2x complexity (два runner'и, double-run risk, секрети в двох місцях). Catch-up on first open це покриває для solo-use.

### ADR-002: File-based state, no database

**Status:** Accepted · 2026-04-24

**Decision:** Весь state — JSON/JSONL/Markdown файли у `state/{brand}/`. Без SQLite, Postgres, etc.

**Consequences:**
- ✅ Zero ops — немає БД яку треба підняти, бекапити, мігрувати.
- ✅ Trivial backup — `git`-іть папку або копіюйте.
- ✅ Людино-читаний state — founder може відкрити файл і подивитись що агент знає.
- ✅ Subagent output легко пише у свій файл без shared connection.
- ❌ Немає queries — якщо треба "дай всі citations за останній місяць по domain=X" — читаємо всі `snapshots/*.jsonl` (JSONL append-only дозволяє streaming). При >1 рік даних перемикаємось на duckdb-over-jsonl, але це вже v2.
- ❌ Concurrent writes — див. §4, ми це не допускаємо через pid-lock. Для solo use ок.

### ADR-003: Subagent boundary — parallelism only

**Status:** Accepted · 2026-04-24

**Decision:** Субагенти спавнимо тільки коли виконуються всі три критерії з §3. В іншому випадку — inline в parent скіл.

**Consequences:**
- ✅ Parent context не забруднюється дрібним paralelism'ом (сумарно дешевше).
- ✅ Subagent prompt можна тримати як окремий артефакт (reproducibility, версіонування).
- ❌ Треба дисципліна — легко "розбити на subagents бо красиво". Правило: defaulted to inline, вимагається justification для subagent.

### ADR-004 Scheduling — catch-up on first open

**Status:** Accepted · 2026-04-24

**Decision:** Єдиний механізм — `scheduled-tasks` MCP всередині Claude Code. Без cron, без launchd, без зовнішнього runner'а.

Якщо Cowork закритий коли настає scheduled час — task стоїть у черзі і виконується при першому відкритті. Це означає: `morning-brief` о 8:00 може реально запуститись о 9:47 коли founder відкрив Cowork. Це ок — brief все одно актуальний (діапазон snapshot'ів = "since last snapshot", не "last 24h").

Для `competitor-radar` (cadence 6h) при catch-up ми виконуємо **один** run для пропущеного часу (не ретроактивно N разів). Логіка: "since > last_run_ts" захоплює весь пропущений інтервал.

**Consequences:**
- ✅ Zero ops — жодного launchd/cron, жодного зовнішнього сервера. Plugin самодостатній.
- ✅ Жодного ризику double-run (був би, якби cron і scheduled-tasks обидва активні).
- ✅ Весь UX через Cowork, без розривів досвіду.
- ❌ Якщо Cowork не відкрито цілу добу — пропустимо один brief window (catch-up при наступному відкритті дасть актуальний стан, але "вчорашнього ранку" не буде). Приймаємо: solo-use, founder і так відкриє Cowork за день.
- ❌ Компромісний варіант для v2 (якщо виросте потреба): headless runner як окрема CLI команда `brand-intel daemon`. Не робимо зараз.

**Implementation note:** scheduled tasks записують run_id у `state/{brand}/runs/` навіть коли skip'нули через pid-lock — потрібен для розуміння `since` часу при наступному запуску.

### ADR-005: Brand як parameter, не гілка коду

**Status:** Accepted · 2026-04-24

**Decision:** Один runtime обслуговує N брендів. `brand_id` → детермінує шлях до config і state. Немає "forks" коду.

**Consequences:**
- ✅ Додати новий бренд = створити YAML + папку. Без deploy, без релізу.
- ✅ Плагін залишається single codebase при зростанні.
- ❌ Per-brand customization (скажімо, інший кастомний subagent) треба буде пробросити через config. Поки ок, v1 не потребує.

---

## Open questions (flagged for Glib)

1. **Peec MCP quota** — скільки запитів на день доступно у тебе зараз? Це впливає на `cost_envelope` кожного скіла. Я припустив що denominator = 500/day free tier, можу помилятись.
2. **Voice provider — Telli чи native TTS?** Telli = "every customer call handled by AI" — це voice-agent API, не чистий TTS. Треба з'ясувати чи ми використовуємо його як (a) callable agent що дзвонить founder'у і проводить брифінг як розмову, або (b) просто TTS-шар. Default якщо не вирішено: macos-say (zero dependency), апгрейд до ElevenLabs для якості, Telli — окрема гілка як voice-agent.
3. **Chrome-in-the-loop** — коли радар виявляє competitor move, чи можна дозволяти агенту відкривати Chrome і постити counter-draft у X/LinkedIn автоматично? Default = НІ (draft only, founder approve), але є argument за full automation після validated period.
