# Pipelines

> Per-pipeline deep dive. Для кожної з W4/W5/W6/W9 — trigger, step graph, cost envelope, evidence requirements, failure modes, gates.

**Version:** 2026-04-25 rev2 (Peec MCP-only snapshot file — no live REST API). Змінюється разом з Inngest function implementations у `inngest/functions/*`.

> ⚠️ **Hackathon scope (2026-04-25, MCP-only Peec):** **W9 + W5 + W7 + W6′** — 4 active pipelines. **W4 (widget) + W6 voice morning brief — `[DEFERRED]`** post-hackathon. Цей файл — full design reference. Decisions: `decisions/2026-04-25-hackathon-scope-cut.md` + `decisions/2026-04-25-peec-overlay-pivot.md` + `decisions/2026-04-25-mcp-only-peec-attio-demo.md`. **Demo brand = Attio (vs Salesforce + HubSpot).**
>
> **Pipeline-by-pipeline:**
> - **W9 Competitor Radar:** Peec snapshot file `data/peec-snapshot.json` (refreshed manually via Claude Code MCP session, sentiment+position+citations native у snapshot) + Tavily fresh news (live, supplementary). Manual trigger demo today. ALL severities у `signals` table; auto-draft тільки для `severity='high'`; medium = on-demand button. Reads `competitors` з `relationship='self'|'competitor'`. Stats aggregated у `runs.stats jsonb`.
> - **W5 Narrative Simulator:** trigger manual через "Simulate alternatives" button on counter-draft або signal. Own LLM panels (gpt-4o + claude-sonnet, 5 prompts × 2 models × 3 variants). Persists у `narrative_variants` з `mention_rate`, `avg_position`, `predicted_sentiment`. Score formula: `mention_rate × (1 / avg_position)`.
> - **W7 Multi-channel Expand:** auto-trigger на counter-draft approval. Один approved → 4 channel variants (blog ~800w, X thread 5 tweets, LinkedIn ~200w, email subject+body). Persists у `content_variants` table. Spec → `features/content-expansion.md`.
> - **W6′ Morning Brief:** manual "Send now" button demo today, daily 8am UTC cron post-hackathon. Aggregates yesterday's signals + drafts + Peec brand pulse → ~200w summary → real Slack send via incoming webhook. Persists у `brief_deliveries`. Spec → `features/morning-brief.md`.

---

## 0. Загальні правила

**Step naming.** id кожного step видно у Inngest UI — іменуй як дієслово з чітким об'єктом: `fetch-snapshots`, `embed-citations`, `synthesize-brief`, `persist-run`. Не `step-1`, не `process`.

**Idempotency.** Кожен `step.run(id, fn)` кешує результат по id у межах run'у. Retry step'у → нова спроба тої ж функції, попередні steps не перезапускаються. Отже: fn має бути idempotent щодо external side effects (INSERT'и з `on conflict do nothing` або upsert'и, не plain INSERT'и без guard'у).

**Cost budget.** Кожен LLM/MCP call → `step.run("log-cost", () => insertCostLedger(...))`. Сума по run'у має вкладатись в envelope (нижче). Якщо вийшли за — emit `run.over-budget` event, не fail run.

**Evidence propagation.** Кожен intermediate artifact тягне `evidence_refs` вперед. Final artifact (narrative, counter-draft, brief) має refs які ведуть назад до raw input (URL або DB row UUID).

**Run closing.** Остання step — завжди `persist-run` що пише `runs` row з `ok: true|false` + `reason` якщо fail. Без цього run "зависне" і metrics не порахуються.

**Gate B** (з CLAUDE.md §Block C) застосовується до output'у кожного pipeline перед "готово".

---

## W4 — Public Widget `[FULL DESIGN — DEFERRED post-hackathon]`

**Призначення.** Регенерувати `narratives` row для бренду — що AI сьогодні говорять про них, з ≤5 highlighted themes + citations. Результат render'иться у SSR `/widget/{brand}` і cache invalidate'иться.

**Hackathon status:** не build'имо. Per `decisions/2026-04-25-hackathon-scope-cut.md` — widget = theater без reaction loop value. Решта секції — full-design reference для post-hackathon.

### Triggers

- **Event:** `widget.regenerate` з reason `"new-snapshot" | "manual" | "schedule"`.
- **Scheduled:** раз на 4 години (emit'ить для кожної active org).
- **Cascade:** W9 після нового snapshot → emits `widget.regenerate` з reason `"new-snapshot"`.

### Step graph

```
[fetch-recent-snapshots]   — remote Supabase SELECT, last 24h snapshots для org
       │
       ▼
[cluster-snapshots]        — embedding cosine similarity → theme groups
       │
       ▼
[synthesize-narrative]     — LLM call з NarrativeSchema; input = clustered themes + top citations
       │
       ▼
[embed-narrative]          — OpenAI embedding на summary_markdown для майбутнього dedup
       │
       ▼
[upsert-narrative]         — INSERT narratives row з is_public=true, citation_ids, embedding
       │
       ▼
[revalidate-cache]         — revalidateTag(`narrative:${organization_id}`) через Next.js
       │
       ▼
[persist-run]              — runs row, ok: true
```

### Cost envelope

~$0.01 / run:
- Embeddings: ~$0.002 (1 narrative + маленький cluster input).
- LLM: ~$0.008 (1 synthesize, ~2k tokens GPT-4o-mini або equivalent).

Per brand per day: 6 regenerates × $0.01 = $0.06/day/brand.

### Evidence requirements

- `narratives.citation_ids` — ≥1 існуючий `citations.id`.
- `narratives.highlighted_themes` — ≥1.
- UI render: кожна theme clickable → opens list of supporting citations.

### Failure modes

| Mode | Detection | Mitigation |
|------|-----------|------------|
| Zero snapshots у 24h window | `fetch-recent-snapshots` returns empty | Skip run з `ok: false, reason: "no recent snapshots"`. Не throw. |
| LLM produces invalid schema | Zod parse fails у `synthesize-narrative` | Retry 3× з тим самим prompt (AI SDK handles). Після — fail run. |
| Cache revalidate fail | `revalidateTag` throws | Log warn, proceed. Cache expire via TTL (5 min) все одно. |
| Widget iframe blocked by CSP | Manual QA | Middleware sets `Content-Security-Policy` relaxed для `/widget/*` path. Див. `ARCHITECTURE.md §3`. |

### Gate B checks

- [ ] `narratives.summary_markdown` ≤ 3000 chars.
- [ ] `highlighted_themes` ≥ 1, ≤ 5.
- [ ] `citation_ids` ≥ 1, всі existing у `citations` table.
- [ ] `is_public = true` (бо `/widget` anon read).
- [ ] Run logged.

---

## W5 — Narrative Simulator `[ACTIVE]`

**Призначення.** На seed (competitor move OR user prompt) згенерувати ranked counter-narratives з score reasoning. Output — список 1–5 варіантів з розставленими ranks.

### Triggers

- **Event:** `narrative.simulate-request` з `seed_type`, `seed_payload`, `num_variants`.
- **UI:** кнопка у `/demo/{brand}` або `/dashboard/{brand}`.

### Step graph

```
[gather-context]           — fetch last 7d snapshots + active counter_drafts + brand voice pillars
       │
       ▼
[generate-variants]        — LLM generate з SimulatorOutputSchema; num_variants control'иться event payload
       │
       ▼
[rank-variants]            — другий LLM call з score reasoning per variant
       │
       ▼
[embed-variants]           — embedding per variant для future comparison
       │
       ▼
[persist-variants]         — INSERT у `narrative_variants` (окрема таблиця, post-demo) або Storage JSON
       │
       ▼
[persist-run]
```

**Примітка.** Для hackathon cut — `narrative_variants` окрема таблиця може бути замінена на JSON у Storage `narrative-simulator-runs/{run_id}.json`. Fast path, trade-off на query-ability. Рішення — при implementation, якщо DB schema drift risky близько до demo, Storage-first.

### Cost envelope

~$0.04 / run:
- Context gather: ~$0.005 (1 embedding search).
- Generate: ~$0.02 (1 structured output, ~5k tokens).
- Rank: ~$0.01 (1 reasoning pass).
- Embed: ~$0.005.

### Evidence requirements

- Кожен variant має `evidence_refs` ≥1 — signal.id OR snapshot.id OR external URL.
- `seed_echo` повертає те що було seed'ом (sanity check — LLM не "забув" що genererував під).

### Failure modes

| Mode | Detection | Mitigation |
|------|-----------|------------|
| Seed invalid (empty competitor-move) | Zod `seed_payload` validation | Reject at route handler, 400 response. |
| LLM returns 0 variants | `variants.min(1)` fails | Retry 3×, потім fallback — return placeholder "no viable counter-narratives for this seed". |
| Ranking all same score | Check variance < 0.05 | Не fail — log warn, show as-is у UI. |

### Gate B checks

- [ ] `variants.length` ≥ 1, ≤ 5.
- [ ] `variants[i].rank` — унікальні ints 1..N.
- [ ] Кожен variant: `body` 50–1500 chars, `score_reasoning` ≥ 20 chars.
- [ ] UI рендерить ranked список, не bullet grid.
- [ ] Run logged з `event_payload` що містить seed.

---

## W6 — Morning Brief (voice) `[FULL DESIGN — DEFERRED post-hackathon, superseded by W6′ Slack version]`

**Призначення.** Щодня о 08:00 local time — синтезувати ≤200 слів briefing про вчорашні snapshots + активні signals, доставити голосом (Telli voice-agent) або TTS fallback.

**Hackathon status:** superseded by W6′ Slack text send (`features/morning-brief.md` + `decisions/2026-04-25-peec-overlay-pivot.md`). Telli/ElevenLabs cost + risk too high для live demo, marketer feedback flagged voice as artifact. Решта секції — full-design reference.

### Triggers

- **Scheduled:** Inngest cron `0 * * * *` (кожну годину UTC) → `morning-brief-tick-dispatcher` function що query'їть orgs де local 08:00 hit'нувся → emit'ить `morning-brief.tick` per org.
- **Manual:** кнопка "Send me brief now" у dashboard.

### Step graph

```
[check-budget]              — poll `cost_ledger` останні 24h, abort якщо >$1/day/brand
       │
       ▼
[fetch-yesterday-snapshots] — 24h window
       │
       ▼
[fetch-active-signals]      — signals з severity in (med, high), last 48h
       │
       ▼
[fetch-pending-drafts]      — counter_drafts with status='draft'
       │
       ▼
[synthesize-brief]          — LLM call з MorningBriefSchema, target ≤200 words
       │
       ▼
[route-delivery]            — determine provider (voice-agent | tts | markdown) per org preference
       │
       ├─ voice-agent → [call-telli]
       │       │
       │       ├─ 200 → wait for webhook (callback resolves step via `step.waitForEvent`)
       │       └─ fail → fallback to TTS
       │
       ├─ tts → [synthesize-tts-elevenlabs] → [upload-audio] → [send-notification]
       │
       └─ markdown → [email-or-dashboard-notify]
       │
       ▼
[persist-voice-result]      — voice_call_results row
       │
       ▼
[persist-run]
```

### Cost envelope

~$0.03 / run (excluding call cost):
- Fetches: free (Supabase queries).
- Synthesize: ~$0.02 (1 structured output ~3k tokens).
- Embedding (optional similar-past-brief lookup): ~$0.002.

Call cost OUTSIDE envelope:
- Telli voice-agent: ~$0.08/call/minute (budget: 2 min = $0.16).
- ElevenLabs TTS: ~$0.01/1k chars (1200 chars ≈ $0.012).

Per brand per day: 1 run × ($0.03 + $0.16 worst case) = $0.19/day/brand.

### Fallback chain

1. **Primary:** Telli voice-agent outbound call.
2. **Fallback 1:** ElevenLabs TTS → upload audio → notification "new brief ready" з audio URL.
3. **Fallback 2:** markdown у dashboard + optional email.

Escalation trigger: if Telli call returns `status: "failed"` у webhook OR no webhook у 5 min → step timeout triggers fallback 1. If ElevenLabs fails — fallback 2.

### Evidence requirements

- `MorningBriefSchema.evidence_refs` ≥1 — mix з `snapshot.id`, `signal.id`, `counter_draft.id` що згадувались у brief.
- Transcript (якщо voice-agent call) зберігається у `voice_call_results.transcript` для later reference.

### Failure modes

| Mode | Detection | Mitigation |
|------|-----------|------------|
| Brief > 200 words | Word count check post-synthesize | Re-prompt LLM з "shorter — 150 words max". Retry 2×, потім truncate з ellipsis. |
| No phone number для org | `voice_call_preference="voice-agent"` but `phone_e164` null | Fallback to TTS без спроби Telli. |
| Webhook не прийшов за 5 хв | `step.waitForEvent` timeout | Mark run as `ok: false, reason: "telli webhook timeout"`. NEXT trigger: cron re-runs завтра, не retry сьогодні. |
| Telli billing over budget | `check-budget` step | `ok: false, reason: "daily budget exceeded"`. Notify у dashboard. |
| Audio upload fails | Storage INSERT error | Retry 3×, потім markdown fallback з inline warning. |

### Gate B checks

- [ ] `text` ≤ 200 words (hard count).
- [ ] ≤1400 chars (for TTS char limit).
- [ ] `evidence_refs` ≥1.
- [ ] `call_to_attention` якщо є ≥1 high-severity signal.
- [ ] Delivery outcome logged у `voice_call_results` (якщо voice path).
- [ ] Run logged.

---

## W9 — Competitor Radar `[ACTIVE]`

**Призначення.** Sweep brand pulse (Peec snapshot delta + Tavily fresh news), класифікувати нові moves, для `severity=high` згенерувати counter-draft.

### Triggers

- **Hackathon:** manual "Run radar now" button у dashboard. No cron.
- **Post-hackathon:** Inngest cron 2h (target SLA per `decisions/2026-04-25-peec-overlay-pivot.md`) — `0 */2 * * *` → emit `competitor-radar.tick` per org. Також manual trigger.

### Step graph (rev2 — Peec snapshot file, не live REST)

```
[load-competitors]              — org's competitors з Supabase (3 rows для Attio demo: Attio self + Salesforce + HubSpot)
       │
       ▼
[peec-load-snapshot]            — read data/peec-snapshot.json через lib/services/peec-snapshot.ts
       │                          → getLatestBrandReport + getBrandReportHistory(7d) per brand
       ▼
[peec-delta-detect]             — diff yesterday vs day-before-yesterday у snapshot history
       │                          → emit signal candidates з source_type='peec_delta':
       │                            visibility delta >10% АБО position delta >1 АБО sentiment changed
       │                          severity heuristic у тому ж step:
       │                            high якщо visibility delta>20% або sentiment flip; med 10-20%; low решта
       ▼
[tavily-supplement]             — tavilySearch per competitor.search_terms для свіжих новин
       │                          → signals tagged source_type='competitor', position=null
       ▼
[dedup]                         — URL-uniqueness over last 30d для Tavily;
       │                          для Peec — по (brand_name, date, metric) tuple
       ▼
[classify-tavily]               — LLM call SignalSchema ТІЛЬКИ для Tavily-sourced signals (Peec вже має severity+sentiment з step 3)
       │
       ▼
[persist-signals]               — INSERT з auto_draft = (severity === 'high')
       │                          Peec → position populated; Tavily → null
       ▼
[fan-out-counter-drafts]        — для signals з severity='high': step.run(`draft-${signal.id}`)
       │   ├─ LLM call (Anthropic claude-sonnet) з CounterDraftSchema
       │   ├─ Peec evidence_refs: ["peec-snapshot:{captured_at}", "https://app.peec.ai/projects/{p}/brands/{b}"]
       │   ├─ Tavily evidence_refs: [signal.id, source_url]
       │   └─ INSERT counter_drafts з status='draft'
       │
       ▼
[aggregate-stats]               — sources_scanned, signals_by_severity, drafts_generated, cost_usd_cents
       │
       ▼
[persist-run]                   — runs row з RadarRunStatsSchema (CONTRACTS §2.8)
```

### Cost envelope (rev2 — Peec snapshot + Tavily, no Firecrawl)

~$0.06 / run (варіює сильно по competitor count):
- Peec snapshot load: free (local JSON read).
- Tavily supplementary search: ~$0.01 (1¢/search, ~3-5 search calls per run).
- Embeddings: ~$0.005 (batch). [DEFERRED post-hackathon — pgvector dedup not built v1.]
- Dedup queries: free (URL-uniqueness over 30d window для Tavily; Peec dedup by tuple).
- Classify (Tavily-only, Peec native): ~$0.02 (LLM per Tavily signal).
- Counter-drafts: ~$0.03 (LLM per high signal, ~0–2 per run).

Per brand per day (post-hackathon cron 2h): 12 runs × $0.06 = $0.72/day/brand. Hackathon (manual trigger demo): single run.

Firecrawl path — `[DEFERRED]` per hackathon scope cut (Tavily covers).

### Policy references

- Severity=high → auto_draft=true. Med/low → log only. **Source:** `decisions/2026-04-24-counter-draft-severity-high-only.md`.
- Counter-drafts завжди `status='draft'`. Human approval — manual via UI або SQL. **Source:** `knowledge/competitive-intel/rules.md`.
- No competitor PII — тільки публічні handles/URLs. **Source:** `knowledge/competitive-intel/rules.md`.

### Evidence requirements

- Кожен `signals.evidence_refs` ≥1 URL до оригінального source (blog post, tweet, release note).
- Кожен `counter_drafts.evidence_refs` ≥1 — `signal.id` (uuid) + signal's `source_url`.
- Dedup audit: якщо signal skip'нуто як dup — log у `runs.event_payload.deduped_against: <signal_uuid>` для traceability.

### Failure modes

| Mode | Detection | Mitigation |
|------|-----------|------------|
| Tavily search returns 0 results | Empty array у response | Log, skip cycle for that competitor, не fail весь run. |
| Rate limit (429) на Tavily | HTTP status | Exponential backoff у wrapper. Якщо >3 retry fail → skip provider цей run. |
| Peec snapshot file stale or invalid | Zod parse fail у `peec-load-snapshot` | Fail step з clear reason "snapshot drift або missing — refresh via Claude Code MCP session". Run marked `ok: false`. |
| Severity classification always "med" | Post-hoc audit на 100 signals → revisit if >50% med | Manually retrain prompt; track у `GAPS.md`. |
| Dedup false negative (duplicates слиpают) | Manual review у demo | Tighten URL-match або (post-hackathon) cosine threshold після pgvector activation. |
| Counter-draft tone off-brand | Human review at approval | Log `status='rejected'` + reason; LLM prompt adjusted. |

### Gate B checks

- [ ] Всі signals мають `evidence_refs` ≥1.
- [ ] Severity class distribution: не всі `low` (sanity check ≥1 non-low за 24h).
- [ ] Counter-drafts тільки для severity=high (grep у migration: check `auto_draft` → matches severity=high).
- [ ] Counter-drafts мають `tone_pillar` з brand voice pillars list.
- [ ] Run logged з `event_payload.sources_scanned` array + `signals_created` count.

---

## Pipeline interactions (cross-pipeline events)

```
W9 → emits "widget.regenerate" → W4                    [DEFERRED W4]
W6 → emits "morning-brief.delivered" → analytics       [DEFERRED W6]
W5 manual trigger from /demo ↓
   → might reference signal from W9 as seed_payload
User approves counter_draft у UI ↓
   → emit "content.expand-request" → W7 auto-trigger   [ACTIVE]
   → (post-demo) emit "counter-draft.published" → potential W4 cascade [DEFERRED]
```

Inngest `step.sendEvent(...)` — preferred над direct `inngest.send(...)` всередині pipeline function (гарантує event emit'иться тільки якщо step commit'ить).

---

## Cross-references

- Schemas → `CONTRACTS.md §2 (LLM output)` + `§1 (events)`.
- DB tables для persist steps → `CONTRACTS.md §3`.
- Deployment / triggering Inngest → `RUNBOOK.md#inngest-deploy`.
- CLI для trigger'у manually → `CLI-TOOLS.md#inngest`.
- Peec snapshot refresh (W9 source) → `RUNBOOK.md §1.5`.
- W7 multi-channel feature spec → `features/content-expansion.md`.
- W6′ Slack brief feature spec → `features/morning-brief.md`.
- Відомі розриви → `GAPS.md`.
- Архітектурні ADRs → `decisions/2026-04-24-subagent-boundary.md`, `decisions/2026-04-24-scheduling-inngest.md`.
- Hackathon scope ADRs → `decisions/2026-04-25-hackathon-scope-cut.md`, `decisions/2026-04-25-peec-overlay-pivot.md` (overlay vision authoritative; superseded sections noted), `decisions/2026-04-25-mcp-only-peec-attio-demo.md` (Peec MCP-only + Attio demo brand).
