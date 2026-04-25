# Skills

> Per-skill specs. Читається після ARCHITECTURE.md. Кожен розділ — достатньо для того, щоб сісти і почати писати SKILL.md файл.

Всі скіли дотримуються template'у з [CONTRACTS.md §7](./CONTRACTS.md#7-skill-contract-template). Нижче — specifics, не повторюю shared поля.

---

## 1. `brand-intel:check` (orchestrator)

> Skill id навмисно `check` (не `brand-intel`), щоб не збігатись з іменем плагіна. Викликається як `/brand-intel:check`.

### Призначення
Top-level координатор. Один вхід, з якого founder може зробити будь-що: "що з нашим брендом", "запусти brief зараз", "запусти radar", "протестуй цей варіант позиціонування". Скіл маршрутизує у sub-скіли, або робить lightweight summary коли user просто хоче поточний стан.

### Коли викликається
- On-demand, коли user каже щось на зразок "check our brand state", "what's happening with visibility", "/brand-intel".
- НЕ scheduled. Scheduled trigger'и йдуть прямо в sub-скіли.

### Specific contract
```yaml
skill_id: check                        # invoked as /brand-intel:check
triggers:
  intents:
    - "brand state"
    - "check visibility"
    - "what's happening with our brand"
inputs:
  required:
    - brand_id: string
  optional:
    - command: "status" | "brief" | "radar" | "simulate" | "auto"
    - args: object  # forwarded to sub-skill
reads:
  - config/{brand_id}.yaml
  - state/{brand}/briefs/{last 3}.md
  - state/{brand}/signals/competitors.jsonl (last 48h)
  - state/{brand}/runs/{last 5}/*.jsonl (health check)
writes:
  - state/{brand}/runs/{run_id}.jsonl
external_calls: none (delegates)
subagents: none
cost_envelope:
  wall_time_max_seconds: 15 (status mode) | delegate (command modes)
```

### Логіка

1. Load config. Fail-fast if missing.
2. If `command == "status"` or no command: compute summary from last 3 briefs + last 48h signals. Output 5-sentence recap. No external calls.
3. If `command == "auto"`: decide what's most useful given state.
   - Якщо сьогодні немає brief'у і час >08:30 → запустити `morning-brief`.
   - Якщо >6h від останнього radar run і є tracked competitors → запустити `competitor-radar`.
   - Якщо жодне — `status` mode.
4. If `command in {brief, radar, simulate}`: forward to sub-skill, pass `run_id` для коррелації.

### Subagent usage
None.

### Failure modes
- Missing config → hard fail with helpful message ("create config/{brand_id}.yaml, see `_template.yaml`").
- Sub-skill failure → bubble up з прикріпленим `run_id` sub-скіла, не повторювати автоматично.

### Open questions
- Чи потрібен "explain" режим який пояснює останній brief природньою мовою? Нагадує "why does my brief say X" — корисно але дорого.

---

## 2. `morning-brief` (W6)

### Призначення
Щоденний 60–90 секунд огляд змін у видимості за останні 24 години. Текст + voice-скрипт + опціонально згенерований аудіо-файл.

### Коли викликається
- Scheduled: щодня `scheduling.morning_brief.local_time` (default 08:00 Europe/Kyiv).
- On-demand: коли founder каже "ранковий brief", "morning brief now".

### Specific contract
Див. CONTRACTS.md §7 (це приклад-референс там).

### Логіка

**Step 1 — Snapshot capture.**
Для кожного `(prompt, llm)` у config пішов запит у Peec MCP. Результат пишеться у `snapshots/{now}.jsonl`. Якщо quota exhausted → `quota_status = "degraded"`, fallback на кеш ≤24h.

**Step 2 — Diff.**
Порівнюємо нові citations з попереднім snapshot'ом (сьогодні vs вчора, плюс 7-day rolling avg).
Для кожного prompt обчислюємо:
- `cite_rate_delta_24h` — зміна % LLM'ів що цитують за 24h.
- `position_delta_24h` — середня зміна позиції у результатах.
- `new_competitors_appearing` — конкуренти що з'явились цього разу а не було раніше.

Прапорці "at risk": drop >15% vs 7-day avg.

**Step 3 — Collect signals.**
Читаємо `signals/competitors.jsonl` за last 24h. Фільтруємо severity >= med. Беремо top 3 за severity × recency.

**Step 4 — Opportunities.**
Це творча частина. Claude Haiku generates 1-2 action items з шаблонів:
- "Prompts at risk → suggest draft post на цю тему."
- "New competitor move → suggest visit `counter-drafts/{sig-id}.md` якщо vже згенеровано."
- "Citation rate stable → suggest proactive content idea."

**Step 5 — Render.**
Записуємо brief-markdown (`{today}.md`). Формат — у CONTRACTS.md §6.

**Step 6 — Voice script.**
Окремий LLM-виклик: "перепиши цей brief як 60-90s monologue, conversational, без markdown, закінчи action item'ом". Зберегти у `{today}-voice.txt`.

**Step 7 — TTS (optional).**
Якщо `tts.provider` конфігнутий — згенерувати аудіо. Якщо провайдер впав — log warning, brief все одно валідний.

**Step 8 — Delivery.**
Файл створено. Якщо `notifications.channel = macos-notification` — fired native notif із посиланням. Якщо slack — webhook POST. Cowork підхопить з UI автоматично.

### Subagent usage
None. Single-pass.

### Failure modes
- Peec quota → degraded mode (cache + quota_status flag у brief).
- Жоден prompt за 7 днів не має даних → brief виводить "Cold start — no baseline yet, check back tomorrow."
- TTS fail → brief без audio, log warning.
- Claude API fail → hard fail, retry наступного дня (brief не пишемо щоб не отруїти diff).

### Cost envelope
- Peec: до `N_prompts × N_llms` calls (20 calls для 4 prompts × 5 LLMs).
- Claude: 2-3 Haiku calls, ~20K tokens.
- Wall time: 60-120s.

### Open questions
- Чи мають з'являтись у brief "wins" (нові цитування) як окрема секція, чи тільки "δ"? Я нахилився до "δ" (до і вниз), але ти можеш хотіти explicit "wins".
- Чи хочемо додати weekend digest (subversion з покриттям 7 днів)?

---

## 3. `narrative-simulator` (W5)

### Призначення
Тестує N варіантів позиціонування/копі і ранжує які "краще ловляться" LLM'ами при існуючих tracked prompts. Не міняє світ — симулює, як поточна видимість змінилася б якби positioning було іншим.

### Коли викликається
- On-demand, коли founder хоче протестувати варіанти перед копірайтом сайту/launch.
- НЕ scheduled.

### Specific contract
```yaml
skill_id: narrative-simulator
triggers:
  intents:
    - "test positioning"
    - "narrative simulator"
    - "will this headline stick"
inputs:
  required:
    - brand_id: string
    - candidates: [string]   # 3-10 positioning texts
  optional:
    - prompt_ids: [string]   # subset of tracked_prompts
    - llms: [string]         # subset of supported LLMs
    - baseline_snapshot_id: string  # else: latest snapshot
reads:
  - config/{brand_id}.yaml
  - state/{brand}/snapshots/{latest}.jsonl
writes:
  - state/{brand}/narratives/{candidate_id}.json (one per candidate)
  - state/{brand}/runs/{run_id}.jsonl
external_calls:
  - peec: baseline snapshot refresh (if >24h old)
  - claude.messages: 1-2 per candidate (judging)
subagents: 1 per candidate (parallel)
cost_envelope:
  mcp_calls_max: 50
  llm_tokens_max: 200000
  wall_time_max_seconds: 300
```

### Логіка

**Step 1 — Validate.** Перевірити кількість кандидатів (3-10). Інакше — refuse with reason.

**Step 2 — Baseline.** Якщо `snapshots/` останній >24h → оновити. Інакше використати existing.

**Step 3 — Spawn subagents, one per candidate.**
Brief для кожного субагента:
```yaml
purpose: "Judge how {candidate_text} would perform across prompts"
brand_context_slice: {...}
task_input:
  candidate_text: "..."
  prompts: [ {prompt_id, query, baseline_results_summary} ]
  llms: [...]
output_schema_ref: "§4 NarrativeCandidate.results[]"
write_path: state/{brand}/tmp/subagent-{id}.json
```

Субагент робить: для кожного `(prompt, llm)` подає Claude'у запит форми "given this prompt and these existing top results, if brand had positioning X, would it likely be cited? Rate 0-1 + reasoning." Повертає results array.

**Step 4 — Merge.**
Parent читає всі `tmp/subagent-*.json`, скидає у `narratives/{candidate_id}.json` кожний окремо, обчислює `aggregate` і `ranking_vs_other_candidates`.

**Step 5 — Output.**
Короткий recap в стандартному output: "Candidate 3 ranks best (+0.15 vs baseline) — recommend adopt. Candidate 1 underperforms, skip. See state/.../narratives/* for full reports."

### Subagent usage
**Ця ж рекомендація з ADR-003:** 1 subagent per candidate. Обґрунтування — паралельність, context isolation, self-contained brief. Якщо candidates < 3 — inline (overhead не виправданий).

### Failure modes
- Subagent timeout (>5min) → mark that candidate як "incomplete", continue with rest.
- All subagents fail → hard fail with aggregated error.
- Judge disagrees wildly (high variance across LLMs) → report це у `recommendation_reasoning`, не придушувати.

### Cost envelope
Dominant cost — Claude judging. Для 5 candidates × 5 prompts × 3 LLMs = 75 judge calls = ~150K tokens. Використати Haiku щоб тримати це у $0.50-$1/запуск.

### Open questions
- Чи правильний підхід — "судити моделлю", а не "реально постити на сайт і чекати crawl"? Так, бо reality ітерація надто довга. Але треба validated pilot run де порівняти судження з реальним результатом за 2 тижні.
- Чи потрібна A/B логіка (показати candidate X тільки на UA, candidate Y тільки на EN)? Для v1 — ні, додаткова complexity.

---

## 4. `competitor-radar` (W9)

### Призначення
Кожні 6 годин моніторить кожного tracked competitor через 3-4 канали (Peec citations, Tavily news, Firecrawl site diffs, optionally X/LinkedIn), детектує "рухи", класифікує severity.

**Counter-draft policy:** автоматично генерується **тільки для `severity=high`**. Med/low сигнали записуються у лог, але жодного auto-draft'у — founder сам вирішить чи реагувати. Це свідоме обмеження scope'а:
- high-severity = sharp trigger (direct positioning attack, major launch, competitive displacement) — коштовно не відреагувати;
- med/low = частіше = шум у inbox'і якщо авто-драфтити;
- `auto_draft: false` інпутом вимикає навіть для high (напр. коли founder не в режимі writing).

### Коли викликається
- Scheduled: кожні `scheduling.competitor_radar.interval_hours` (default 6h), з offset 15min.
- On-demand: "radar now", "check competitors".

### Specific contract
```yaml
skill_id: competitor-radar
triggers:
  intents:
    - "competitor radar"
    - "check competitors"
    - "any moves from {competitor}"
  scheduled:
    enabled_by_config: scheduling.competitor_radar.enabled
    default: "every 6h"
inputs:
  required:
    - brand_id: string
  optional:
    - competitor_ids: [string]  # else: all
    - since: ISO8601            # else: last run + 1min
    - auto_draft: bool = true   # if false, no counter-drafts generated
reads:
  - config/{brand_id}.yaml
  - state/{brand}/signals/competitors.jsonl (last 7d — for dedup)
  - state/{brand}/counter-drafts/ (existing drafts)
writes:
  - state/{brand}/signals/competitors.jsonl (append)
  - state/{brand}/counter-drafts/{ts}-{sig_id}.md (new drafts)
  - state/{brand}/runs/{run_id}.jsonl
external_calls:
  - peec.queryCitations
  - tavily.search (HTTPS)
  - firecrawl.scrape (HTTPS)
  - claude.messages (severity + drafts)
subagents: 1 per competitor (parallel)
cost_envelope:
  mcp_calls_max: 100
  llm_tokens_max: 150000
  wall_time_max_seconds: 360
```

### Логіка

**Step 1 — Build work list.**
Список competitors = intersection(config.tracked_competitors, input.competitor_ids).
Якщо список пустий → early exit з warning.

**Step 2 — Spawn subagents.**
Brief для кожного:
```yaml
purpose: "Scan competitor {id} for moves since {since}"
brand_context_slice:
  brand_name, positioning_summary, tone_guidelines
task_input:
  competitor: {...config slice...}
  sources: competitor.watch_sources
  since: "..."
  prior_signals_summary: "3 signals last 7d: ..."   # dedup helper
output_schema_ref: "§3 CompetitorSignal[]"
```

Subagent робить:
- Для source=peec: запит citations для brand-related prompts; шукає competitor-mentions; класифікує як `position_shift` або `new_citation`.
- Для source=tavily: query "`{competitor.name}` news", "`{competitor.name} site:{competitor.url}`", за останні N годин.
- Для source=firecrawl: скрапить `{competitor.url}/blog` (або index URL), порівнює list з prior snapshot → нові URL → скрапить контент.
- Класифікує severity (низька/середня/висока) через Claude-call з rubric: "high = direct positioning attack or major product launch; med = notable content/announcement in overlapping space; low = minor activity".

**Step 3 — Merge & dedup.**
Parent читає `tmp/subagent-*.json`, мерджить signals. Дедуп vs last 7 days (rule у CONTRACTS.md §3). Append у `signals/competitors.jsonl`.

**Step 4 — Counter-drafts (if auto_draft).**
Для кожного сигналу з `severity = high`:
- Claude Sonnet генерує draft per channel (X + LinkedIn, за default).
- Tone-check: перевіряє forbidden_phrases/patterns з config. Якщо порушено — regenerate 1 раз, далі flag `tone_check_passed: false` і continue.
- Пише `counter-drafts/{ts}-{sig_id}.md` зі status=`draft`.
- Оновлює signal's `counter_draft_id` (rewrite JSONL line? ні — appendовий лог, пишемо update event у runs).

**Step 5 — Summary.**
Short stdout: "Scanned 3 competitors, 5 new signals (1 high, 2 med, 2 low). 1 counter-draft ready for review."

### Subagent usage
1 per competitor. Відповідає ADR-003 (паралельно, self-contained, great context isolation).

### Failure modes
- Одне джерело у субагента впало — субагент продовжує з рештою, відмітка у returns.errors.
- Весь subagent впав — parent логує, продовжує з рештою competitors.
- Tavily rate limit → skip channel на цей run, flag next-run.
- Counter-draft generation впала — залишаємо signal без draft, founder сам звернеться до нього з інших workflows.

### Cost envelope
- Peec: 5-10 calls per competitor × N competitors.
- Tavily: 2 calls per competitor.
- Firecrawl: 1-3 calls per competitor.
- Claude severity classification: 1 Haiku call per signal.
- Claude counter-drafts: 1-2 Sonnet calls per high-severity signal.
- Total worst case for 5 competitors × 4 runs/day: tight under free tier, acceptable.

### Open questions
- Чи дозволяти "X/LinkedIn" як канал? У v1 без browser automation це означає RSS/scraping — ризиковано і fragile. Пропоную: v1 = peec + tavily + firecrawl. v2 = додати X через API (після хакатона).
- Як довго зберігати `signals/competitors.jsonl`? Для діда я би тримав 365 днів, потім архівувати у `signals/archive/{year}.jsonl`.

---

## Підхід до implementation

Рекомендований порядок реалізації (розташовано від найменшого ризику до найбільшого):

1. **`morning-brief` first.** Найпростіший, single-pass, жодних субагентів. Одразу дає value. Перевіряє Peec MCP integration.
2. **`narrative-simulator` next.** Додає subagent pattern, але детермінована структура. Тест паралельного запуску.
3. **`competitor-radar` last.** Найбільший — 3 external sources + severity classifier + counter-draft generator. До цього часу ти вже відчуваєш систему і знаєш що звучить правильно.
4. **`brand-intel` (orchestrator) поверх.** Пишеться коли три sub-скіла вже працюють, бо він просто маршрутизує. Опціональний.

На кожному кроці: спочатку stub SKILL.md за template'ом, потім mock run (читає config, пише fake brief у state), потім реальні external calls. Interim тести через `dry_run: true` input.

---

## Що цей документ **не** покриває

- SKILL.md frontmatter для Claude Code plugin — це буде наступний artefact, окремий файл per skill у `skills/` папці. Тут ми описуємо лише **logic contract**, не Claude Code metadata.
- Prompts для LLM calls (summarization, judging, drafting). Кожен prompt теж stableний артефакт і заслуговує власного файлу (`skills/_prompts/*.md`). Додамо після того як логіка валідована.
- Widget (W4) — окремо, не частина skills layer.
