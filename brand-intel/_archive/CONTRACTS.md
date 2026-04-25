# Contracts

> Схеми, сигнатури, і очікувані формати даних. Це source of truth для implementation. Коли код і цей документ не збігаються — змінюємо документ *перед* кодом, не навпаки.

**Convention:** `?` = optional, `[]` = array, `{}` = object, `| "literal"` = enum.

## Table of contents

1. [Brand config](#1-brand-config-brandcontext)
2. [Visibility snapshot](#2-visibility-snapshot)
3. [Competitor signal](#3-competitor-signal)
4. [Narrative candidate](#4-narrative-candidate)
5. [Counter-draft](#5-counter-draft)
6. [Morning brief](#6-morning-brief)
7. [Skill contract (template)](#7-skill-contract-template)
8. [Subagent brief contract](#8-subagent-brief-contract)
9. [External integrations](#9-external-integrations)
10. [Run log events](#10-run-log-events)

---

## 1. Brand config (BrandContext)

**Location:** `config/{brand_id}.yaml`
**Writer:** human (founder), manually edited.
**Readers:** all skills.

```yaml
schema_version: 1
brand:
  id: self-promo              # slug, matches config filename and state dir
  name: "Glib Gavryliuk"
  type: personal | startup | product
  urls:
    primary: https://example.com
    aliases: []               # other domains where brand lives
  handles:
    x: "@handle"
    linkedin: "linkedin.com/in/..."
    github: "github.com/..."
  languages: [uk, en]         # ISO 639-1
  regions: [UA, US]           # ISO 3166-1 alpha-2

positioning:
  current: |
    One-paragraph current positioning. This is what we test against
    and what counter-drafts should stay consistent with.
  last_updated: 2026-04-20
  pillars:                    # 3-5 core messages
    - "Pillar 1 statement"
    - "Pillar 2 statement"

tracked_prompts:              # what we monitor across LLMs
  - id: p001
    query: "best AI education startups in Ukraine 2026"
    lang: en
    region: UA
    topic: ai-education
    priority: high | med | low
  - id: p002
    query: "як навчити дитину кодити з AI"
    lang: uk
    region: UA
    topic: ai-education
    priority: high

tracked_competitors:
  - id: tinkrebels
    name: "TinkRebels"
    urls: [https://tinkrebels.com]
    handles:
      x: "@..."
      linkedin: "..."
    watch_sources: [peec, tavily, firecrawl]   # subset of radar channels
    severity_threshold: low    # what qualifies as reportable move
  - id: codakid
    ...

tone:
  guidelines_path: ./tone.md  # optional, fuller guideline doc
  forbidden_phrases:
    - "revolutionary"
    - "game-changer"
  forbidden_patterns:
    - "as an AI"

sources:
  peec:
    project_id: "peec-project-uuid"
    free_tier: true
    daily_call_budget: 500
  tavily:
    api_key_env: TAVILY_API_KEY
  firecrawl:
    api_key_env: FIRECRAWL_API_KEY
  voice:                       # see §9.4 for full spec
    mode: tts | voice-agent    # default: tts
    # --- mode == tts ---
    provider?: macos-say | elevenlabs
    voice_id?: "elevenlabs-voice-id"
    # --- mode == voice-agent ---
    provider?: telli
    api_key_env?: TELLI_API_KEY
    agent_id?: "tel-agent-..."
    callee_number?: "+380xxxxxxxxx"
    call_window?:
      tz: "Europe/Kyiv"
      earliest: "07:30"
      latest: "10:00"
    max_duration_seconds?: 180
    store_recording?: false

scheduling:
  morning_brief:
    enabled: true
    local_time: "08:00"
    tz: "Europe/Kyiv"
    delivery: [markdown, voice]
  competitor_radar:
    enabled: true
    interval_hours: 6
    offset_minutes: 15
  quotas:
    weekly_mcp_budget: 3000   # used by orchestrator to throttle

notifications:
  channel: file | macos-notification | slack
  slack_webhook_env?: SLACK_WEBHOOK
```

Only `schema_version`, `brand.id`, `brand.name`, `positioning.current`, and at least one `tracked_prompts[]` entry are **required**. All else defaults.

---

## 2. Visibility snapshot

**Location:** `state/{brand}/snapshots/{ISO8601-utc}.jsonl`
**Writer:** `morning-brief`, `narrative-simulator` (side-effect of probing).
**Reader:** `morning-brief` (diff vs prior), `narrative-simulator` (baseline), orchestrator.

One JSONL file per capture. One line per `(prompt_id × llm)` cell.

```json
{
  "schema_version": 1,
  "captured_at": "2026-04-24T08:00:00Z",
  "run_id": "run-a1b2c3",
  "brand_id": "self-promo",
  "prompt_id": "p001",
  "llm": "chatgpt" | "claude" | "gemini" | "perplexity" | "ai-mode",
  "llm_model_tag": "gpt-4o-2024-11-20",
  "brand_cited": true,
  "position": 2,
  "citation_excerpt": "...text where brand is mentioned...",
  "cited_urls": ["https://..."],
  "competitors_cited": [
    {"competitor_id": "tinkrebels", "position": 1}
  ],
  "raw_response_ref": "cache/peec/2026-04-24T08-00-00Z/p001-chatgpt.json"
}
```

Aggregates are computed on-read (no denormalization). `cache/peec/...` holds the raw MCP response for audit — drop after 30 days.

---

## 3. Competitor signal

**Location:** `state/{brand}/signals/competitors.jsonl`
**Writer:** `competitor-radar` (append-only).
**Reader:** `morning-brief` (for highlights section), orchestrator, downstream `counter-draft` step.

```json
{
  "schema_version": 1,
  "signal_id": "sig-7x9y2z",
  "detected_at": "2026-04-24T14:15:00Z",
  "run_id": "run-...",
  "competitor_id": "tinkrebels",
  "source": "peec" | "tavily" | "firecrawl" | "x" | "linkedin",
  "type": "new_citation" | "lost_citation" | "new_blog_post" | "new_product" | "pricing_change" | "tweet_thread" | "position_shift",
  "summary": "Short one-sentence human-readable summary.",
  "details": {
    "url?": "https://...",
    "delta?": "+3 positions on prompt p001 across ChatGPT+Perplexity",
    "excerpt?": "..."
  },
  "severity": "low" | "med" | "high",
  "severity_reasoning": "Why we rated it this way (for audit).",
  "counter_draft_required": true,
  "counter_draft_id?": "draft-..."   // set after draft generated
}
```

Dedup rule: before appending, `competitor-radar` checks last 48h for `(competitor_id, source, type, details.url)` match. If matches — skip, do not double-alert.

---

## 4. Narrative candidate

**Location:** `state/{brand}/narratives/{candidate-id}.json`
**Writer:** `narrative-simulator`.
**Reader:** founder (human), future simulator runs (compare baselines).

```json
{
  "schema_version": 1,
  "candidate_id": "nc-2026-04-24-001",
  "created_at": "2026-04-24T12:30:00Z",
  "run_id": "run-...",
  "brand_id": "self-promo",
  "text": "Proposed positioning statement being tested.",
  "pillars_tested": ["pillar-id-1", "pillar-id-2"],
  "test_plan": {
    "prompt_ids": ["p001", "p002", "p003"],
    "llms": ["chatgpt", "claude", "perplexity"],
    "variations_per_prompt": 3
  },
  "results": [
    {
      "prompt_id": "p001",
      "llm": "chatgpt",
      "would_be_cited": true,
      "confidence": 0.78,
      "rationale": "Narrative contains entities and terms that align with prompt intent..."
    }
  ],
  "aggregate": {
    "cite_rate": 0.67,
    "vs_baseline_delta": "+0.12",
    "ranking_vs_other_candidates": 2
  },
  "recommendation": "adopt" | "revise" | "reject",
  "recommendation_reasoning": "..."
}
```

`would_be_cited` is a **model-judged prediction**, not an actual LLM answer (we do not literally rewrite the web). The judge is Claude with access to the candidate + current citation baseline for that prompt.

---

## 5. Counter-draft

**Location:** `state/{brand}/counter-drafts/{YYYY-MM-DD}-{signal-id}.md`
**Writer:** `competitor-radar` (after high-severity signal).
**Reader:** founder.

```yaml
---
schema_version: 1
draft_id: draft-a1b2c3
created_at: 2026-04-24T14:20:00Z
run_id: run-...
brand_id: self-promo
trigger_signal_id: sig-7x9y2z
status: draft | approved | published | discarded
channel: x | linkedin | blog | email-list | slack
tone_check_passed: true
forbidden_phrases_used: []
recommended_publish_window: "2026-04-24 16:00–20:00 local"
---

# Counter-draft: [summary of what we're responding to]

## Context
Two sentences on what competitor did and why we should respond.

## Recommended post

[The actual draft text, ready to copy-paste.]

## Alternatives
1. Short variant (for X)
2. Long variant (for LinkedIn)

## Rationale
Why this framing. Which positioning pillar it reinforces. What we're *not* saying and why.
```

Drafts are **never auto-published**. Founder approves → status `approved` → optional publishing skill picks up. v1 has no auto-publish.

---

## 6. Morning brief

**Location:** `state/{brand}/briefs/{YYYY-MM-DD}.md`
**Writer:** `morning-brief`.
**Reader:** founder.

```yaml
---
schema_version: 1
brief_date: 2026-04-24
created_at: 2026-04-24T08:00:00Z
run_id: run-...
brand_id: self-promo
window: 24h
voice_script_path: ./2026-04-24-voice.txt   # plain text, TTS-ready
voice_audio_path?: ./2026-04-24-voice.mp3
quota_status: normal | degraded | quota-exhausted
sections:
  - delta
  - competitors
  - prompts_at_risk
  - opportunities
---

# Brand brief — 2026-04-24

## Δ overnight (what moved)
Two-three sentences. Up, down, or flat. Numbers.

## Competitor movements
0-3 bullet items of noteworthy signals from `competitors.jsonl` since yesterday's brief.

## Prompts at risk
Any tracked_prompt where citation rate dropped >15% vs 7-day avg.

## Opportunities
1-2 action-oriented suggestions (draft a post, reach out, etc.).

---
Generated at 08:00 Europe/Kyiv · cost 127 MCP calls · budget 373 remaining today.
```

Voice script (`*-voice.txt`) is a **60–90 second** plain-text monologue designed for TTS:
- No markdown, no headings, no bullets.
- Conversational phrasing, short sentences.
- Numbers spelled out when ambiguous ("twelve percent" not "12%").
- Ends with one explicit action prompt.

---

## 7. Skill contract (template)

Every skill **must** ship with this metadata block in its `SKILL.md` frontmatter or at top of file:

```yaml
skill_id: morning-brief
version: 1
triggers:
  intents:
    - "morning brief"
    - "what moved overnight"
    - "daily brand update"
  scheduled:
    enabled_by_config: scheduling.morning_brief.enabled
    default: "daily 08:00 local"
inputs:
  required:
    - brand_id: string    # must match config/{brand_id}.yaml
  optional:
    - window_hours: int = 24
    - dry_run: bool = false
reads:
  - config/{brand_id}.yaml
  - state/{brand}/snapshots/*.jsonl (last 7 days)
  - state/{brand}/signals/competitors.jsonl (last window_hours)
  - state/{brand}/briefs/{yesterday}.md   # for delta
writes:
  - state/{brand}/snapshots/{now}.jsonl
  - state/{brand}/briefs/{today}.md
  - state/{brand}/briefs/{today}-voice.txt
  - state/{brand}/runs/{run_id}.jsonl
external_calls:
  - peec.getCitations: ~N_prompts × N_llms calls
  - tts.synthesize: 1 call (optional)
  - claude.messages: ~2-3 calls (summarization)
subagents: none
outputs:
  artifact: state/{brand}/briefs/{today}.md
  stdout_summary: 3-sentence recap for Cowork UI
failure_modes:
  - peec_quota_exhausted: use cached snapshot, mark quota_status=degraded, continue
  - tts_unavailable: omit voice files, log warning, continue
  - config_missing: error out, do not write partial state
cost_envelope:
  mcp_calls_max: 200
  llm_tokens_max: 50000
  wall_time_max_seconds: 120
idempotency:
  - safe_to_retry: true (overwrite today's brief is acceptable)
```

Skill implementations must:
- Validate `BrandContext` against schema at start; exit early if invalid.
- Generate and use a single `run_id` for the full execution.
- Emit `run_start` and `run_end` events to `runs/*.jsonl` (see §10).
- Release pid-lock even on exception.
- Never swallow exceptions silently — log to run events.

---

## 8. Subagent brief contract

Parent skill passes a **self-contained** brief to each subagent. Subagent has no access to parent state except through the brief.

### Brief structure (what parent sends)

```yaml
subagent_brief:
  parent_run_id: run-...
  subagent_id: sub-...
  purpose: "Scan competitor {id} for moves in last 6 hours"
  brand_context_slice:
    brand_name: "..."
    positioning_summary: "...current positioning, 1 para..."
    tone_forbidden_phrases: [...]
  task_input:
    # Workflow-specific input. Must be small, explicit, no pointers back to state.
    competitor:
      id: tinkrebels
      name: "TinkRebels"
      urls: [...]
      handles: {...}
    sources_to_scan: [peec, tavily, firecrawl]
    since: 2026-04-24T02:15:00Z
    prior_signals_summary: "Last 48h: 2 signals (new_blog_post, tweet_thread)"
  output_schema:
    # Reference to schema in this document
    ref: "§3 CompetitorSignal[]"
  cost_envelope:
    mcp_calls_max: 30
    llm_tokens_max: 15000
    wall_time_max_seconds: 180
  write_permissions:
    allowed_paths:
      - state/{brand}/tmp/subagent-{subagent_id}.json
    # Subagent writes only here. Parent merges into permanent state.
```

### Return contract (what subagent must return)

```yaml
subagent_return:
  subagent_id: sub-...
  ok: true | false
  output: [ ... ]    # matches output_schema.ref
  events:
    # Mini run-log, parent appends into its own runs/*.jsonl
    - {ts, event: external_call, system: peec, ok: true, duration_ms, ...}
  errors: [...]      # non-fatal errors that didn't block output
  fatal_error?: "..." # if ok=false
  cost_used:
    mcp_calls: 23
    llm_tokens: 12430
    wall_time_seconds: 142
```

**Rules:**
- Subagent **does not** read `config/` or other state files. Everything it needs is in the brief.
- Subagent writes **only** to `tmp/subagent-{id}.json`. Parent is responsible for merging into permanent state.
- Subagent output must be **deterministic-ish** — same brief + same external state → same output shape. Timestamps and ids differ, semantic content shouldn't wildly vary.

---

## 9. External integrations

### 9.1 Peec MCP

We depend on a subset of Peec's MCP surface. This is our **expected shape** — probe before wiring.

```
Tool: peec.queryCitations (name tentative, verify on connection)
Input:
  project_id: string
  prompt: string
  llms?: ["chatgpt", "claude", "gemini", "perplexity", "ai-mode"]
  since?: ISO8601
  region?: string
  language?: string
Output (expected):
  project_id, prompt, captured_at,
  results: [
    {
      llm, model_tag,
      response_text,
      brand_mentions: [{brand_name, position, excerpt, cited_url?}],
      competitor_mentions: [...],
      raw_response_id  // for audit
    }
  ]
```

**Pre-implementation TODO:** call `peec.queryCitations` once in chat with one known prompt and snapshot the actual response shape. Adjust this contract + write an adapter layer at `skills/_peec_adapter.md` (thin translation from Peec shape to our `VisibilitySnapshot` row).

**Rate limiting assumption:** free tier ~500 calls/day per project. Each tracked prompt × LLM = 1 call. If 10 prompts × 5 LLMs = 50 calls per snapshot. Daily brief + 4× radar = budget ~250 calls/day worst case. Under limit, but tight.

### 9.2 Tavily

```
Endpoint: https://api.tavily.com/search (HTTPS, not MCP)
Auth: Bearer TAVILY_API_KEY
Input:
  query: "TinkRebels site:tinkrebels.com OR TinkRebels news"
  time_range: "week" | "day"
  max_results: 10
  include_domains?: [...]
Output:
  results: [{title, url, content, published_date, score}]
Usage in radar:
  For each competitor, 1-2 queries per run (name + site:, name + "news").
  Budget: ~10 calls/run × 4 runs/day = 40 calls/day.
```

### 9.3 Firecrawl

```
Endpoint: https://api.firecrawl.dev/v0/scrape
Auth: Bearer FIRECRAWL_API_KEY
Input:
  url: https://competitor.com/blog
  pageOptions: { onlyMainContent: true }
Output:
  markdown: "...scraped content..."
  metadata: { title, description, ... }
Usage:
  Scrape competitor blog index on schedule; diff URL list to detect new posts.
  For new post — scrape full content, pass to subagent for classification.
  Budget: ~5 calls/run × 4 runs/day × N competitors = tune per tier.
```

### 9.4 Voice delivery (TTS vs voice-agent)

Два різні режими доставки voice'ового brief'у, обираються через `sources.voice.mode`:

**Mode A — `tts`** (one-way playback)
Повертає audio-файл. Провайдери:
- `macos-say`: zero-cost, zero-dep, `say -v Daniel -o out.aiff`. Fallback якщо інші провайдери впадуть.
- `elevenlabs`: HTTPS POST `/v1/text-to-speech/{voice_id}`, returns mp3 bytes.

```
input: text: string (max 2000 chars)
output: audio_path: string (local file)
failure: return null, log warning, do not throw
```

**Mode B — `voice-agent` (Telli)** (interactive phone call)
Telli робить outbound call на founder'ів номер, читає brief, відповідає на питання у real-time.

Config:
```yaml
sources:
  voice:
    mode: voice-agent
    provider: telli
    api_key_env: TELLI_API_KEY
    agent_id: "tel-agent-..."          # pre-configured у Telli dashboard
    callee_number: "+380xxxxxxxxx"
    call_window:                        # не дзвонити поза цим вікном
      tz: "Europe/Kyiv"
      earliest: "07:30"
      latest: "10:00"
    max_duration_seconds: 180
```

Contract:
```
input:
  brief_script: string              # той же що і для TTS — 60-90s monologue
  brief_context_summary: string     # 1-sentence digest (для Q&A fallback)
  allow_questions: bool             # false = pure playback, true = interactive
  knowledge_refs:                   # subset of state Telli дозволено "пам'ятати"
    - state/{brand}/briefs/{today}.md
    - state/{brand}/signals/competitors.jsonl (last 24h)

output:
  call_id: string
  status: "completed" | "no_answer" | "rejected" | "error"
  duration_seconds: number
  recording_url: string?            # якщо Telli зберігає
  transcript: string?               # post-call transcript
  user_questions: [                 # що founder запитав під час дзвінка
    {q: string, answered: bool, answer_excerpt: string}
  ]
  artifacts_updated: [string]       # шляхи у state/ що Telli модифікував
                                    # ЗАЗВИЧАЙ ПУСТИЙ — Telli read-only по state'у

failure:
  no_answer → log, retry once через 10 min, then fall back to macos-say playback
  rejected → log, no retry (founder declined consciously)
  api_error → fall back до TTS mode з full script
  rate_limit → fall back до TTS mode
```

**Knowledge injection:**
Telli агент сконфігурований у їхньому dashboard з системним промптом який знає:
- який бренд репрезентує,
- що це morning brief, не sales call,
- персоналізовано до founder'а (name, context),
- обмежений scope Q&A (не відповідає на питання поза brief'ом),
- має escape hatch: "I'll note that and the team can follow up" — якщо питання поза межами.

Скіл перед виконанням POST'ить у Telli API поточний `brief_context_summary` як knowledge update на цей call. Це забезпечує свіжість.

**Privacy note:**
- Recording зберігається тільки якщо `store_recording: true` у config. Default: false.
- Transcript завжди зберігається локально у `state/{brand}/briefs/{today}-call-transcript.txt`.
- Якщо Telli dashboard має retention > 7d — це треба manually override у их settings.

**Mode selection rule (default у MVP):**
- `mode: tts` + `provider: macos-say` — default. Zero ops.
- `mode: voice-agent` — якщо `callee_number` + `TELLI_API_KEY` обидва налаштовані.
- Переключатись між режимами можна без code change, тільки config.

### 9.5 Claude API (for generation steps)

Used by skills for: summarization (brief), ranking (narrative sim), drafting (counter-draft), classification (signal severity).

Model defaults:
- Summarization, classification: `claude-haiku-4-5-20251001` (cheap, fast).
- Drafting (counter-drafts): `claude-sonnet-4-6`.
- Deep analysis if budget allows: `claude-opus-4-6`.

All LLM calls must pass `brand_id` in metadata for cost attribution.

---

## 10. Run log events

**Location:** `state/{brand}/runs/{YYYY-MM-DD}-{run-id}.jsonl`
**One line per event.** All events include `ts` (ISO8601 UTC) and `run_id`.

```json
{"ts":"...","run_id":"...","event":"run_start","skill":"morning-brief","trigger":"scheduled","brand_id":"self-promo","config_version":"...","input":{...}}

{"ts":"...","run_id":"...","event":"external_call","system":"peec","operation":"queryCitations","ok":true,"duration_ms":842,"cost_units":{"mcp_calls":1,"tokens":0}}

{"ts":"...","run_id":"...","event":"subagent_spawn","subagent_id":"sub-...","purpose":"...","input_bytes":1234}

{"ts":"...","run_id":"...","event":"subagent_return","subagent_id":"sub-...","ok":true,"output_bytes":4567,"cost":{"mcp_calls":23,"tokens":12430,"wall_ms":142000}}

{"ts":"...","run_id":"...","event":"write","path":"state/.../briefs/2026-04-24.md","bytes":3102}

{"ts":"...","run_id":"...","event":"warn","message":"peec response missing model_tag field","severity":"low","context":{...}}

{"ts":"...","run_id":"...","event":"error","message":"tavily 429","severity":"med","retries":2,"final":"skip_channel"}

{"ts":"...","run_id":"...","event":"run_end","ok":true,"duration_ms":118000,"cost_total":{"mcp_calls":127,"tokens":42310},"artifacts":["state/.../briefs/2026-04-24.md"]}
```

Events are append-only. A crashed run will not have `run_end` — that's a signal for next orchestrator tick to investigate.
