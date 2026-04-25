---
date: 2026-04-25
status: accepted (Peec sections superseded by 2026-04-25-peec-overlay-pivot.md)
topic: hackathon-day MVP scope
supersedes: none
superseded_by: 2026-04-25-peec-overlay-pivot.md (Peec sections only — original scope cut decision still authoritative for marketer-fix UX patches, sentiment/position adoption, voice/widget deferral)
adr_ref: brand-intel/ARCHITECTURE.md §1 + brand-intel/features/{dashboard,onboarding,content-expansion,morning-brief}.md
post_hackathon_reassess: 2026-04-26
---

> **2026-04-25 update:** Peec sections of цей ADR superseded by `2026-04-25-peec-overlay-pivot.md`. Peec moved from `[DEFERRED]` → primary data source via free MCP through Peec MCP Challenge program. Решта рішень цього ADR (UX patches, sentiment/position, voice/widget cut, marketer-feedback fixes) залишаються authoritative.

# Hackathon (2026-04-25) — обмежена scope

## Context

Demo today. ~9-12 годин коду max. Початковий scope з 4 pipeline'ами (W4 widget, W5 simulator, W6 voice brief, W9 radar) + content generation pipeline = 15+ годин. Не reach без ризику все недопрацювати.

Дві ChatGPT-4-сесії з симульованим CMO-критиком (B2B SaaS marketer) дали:

- **Round 1 (CX gaps):** 7 frustrations — approval bottleneck, no CMS bridge, missing onboarding, no effectiveness loop, no team collab, radar runs blind, voice = artifact.
- **Round 2 (missed use-cases):** 10 categories — crisis comms (self-monitoring), product launch positioning, pricing/funding response, sales enablement, content gaps, persona variations, geography/language, brand persona drift, compliance, cost discipline, integrations, measurement, failure modes.

Всі transcripts — `brand-intel/feedback/marketer-2026-04-25.md`.

## Decision

**Сьогодні shippимо W9 + W5 + dashboard з UX patches. Voice (W6) і widget (W4) — deferred.**

### W9 (Competitor radar) — у scope

- Trigger: manual через "Run radar now" button. Cron 24h додаємо post-hackathon.
- Sources: Tavily Search + Tavily Extract. Firecrawl drop'ається — credits відсутні.
- Output: ВСІ severity (low/med/high) пишуться у `signals` table. Видимі у dashboard з color-coded badges.
- Auto-draft: тільки `severity='high'` створює counter-draft автоматично. Рішення підтверджено per `decisions/2026-04-24-counter-draft-severity-high-only.md` + marketer failure mode #3 ("over-reaction to noise").
- Medium signals: видимі + on-demand button "Generate counter-draft" — user decides чи інвестувати у LLM cost + approval review.
- Low signals: видимі без draft action.
- **Self-monitoring додано** — `competitors.relationship` enum включає `self`. Наша власна brand моніториться через ту саму machinery (crisis comms coverage без окремого pipeline'а).

### W5 (Narrative simulator) — у scope

- Trigger: manual через "Simulate alternatives" button на counter-draft card. Або "Simulate" на signal_id.
- Generates 3 positioning variants → runs each через 5 customer prompts × 2 models (gpt-4o + claude-sonnet-4) → ranks by brand mention rate + position.
- Output: `narrative_variants` rows з ranking score + reasoning.

### Dashboard `/demo/[brand]` — нова scope

5 sections (mobile-first, public RLS). Детальні acceptance criteria — `brand-intel/features/dashboard.md`.

1. **Audit panel (top)** — last run statistics з `runs.stats jsonb`: scanned sources, signals by severity, drafts generated, cost. Marketer pain #6 fix.
2. **Competitors panel (read-only)** — seed competitors з `relationship` badge. "Add competitor" tooltip. Marketer pain #3 light fix.
3. **Active signals (24h)** — ALL severities color-coded + filter chips. Click → evidence chain modal. Marketer pain #6 cont.
4. **Counter-drafts queue** — Approve / Reject / Copy as Markdown buttons + "Generate alternatives" → W5. Marketer pains #1+#2 fix.
5. **Simulator outputs** — ranked variants з score badges + reasoning.

Plus **email digest preview** (mocked card showing what 8am email would look like — UX без integration risk; marketer pain #7 light fix) + **v2 footer note** ("Performance tracking, team collaboration, CMS publishing — coming v2").

### Cost badge

Кожен run aggregates cost у `runs.stats.cost_usd_cents` через `step.run("persist-run", ...)`. Dashboard відображає "$X" badge. Marketer round-2 hackathon-priority recommendation #1 (transparency = trust).

### Sentiment + Position (added 2026-04-25 post Peec audit)

Marketer round-2 implicit gap (brand persona drift, share-of-voice delta) + Peec.ai feature audit показали що production-grade brand monitoring tracks **3 dimensions:** visibility (mention rate), position (rank у lists), sentiment (positive/neutral/negative). Наша initial schema мала тільки severity (impact axis). Severity ≠ sentiment.

**Adopted у hackathon scope (+1h budget):**

- `sentiment_label` enum (positive, neutral, negative).
- `signals.sentiment` mandatory column. Class'ифікується LLM'ом у same call as severity (no added cost).
- `narrative_variants.predicted_sentiment` (sentiment of variant text itself — brand-voice safety check).
- `narrative_variants.avg_position` (parse LLM responses, find brand rank у lists, null якщо не з'являється).
- `narrative_variants.mention_rate` (fraction of test prompts де brand mentioned).
- W5 score formula: `score = mention_rate × (1 / avg_position)` normalized.
- Dashboard UI: color-coded sentiment chips on signals/drafts (green smile / gray neutral / red frown). Position badges на variant cards. Score reflects all three dimensions.

**Demo angle:** "Look — high-severity NEGATIVE signal про competitor pricing leak (red frown) → counter-draft generated з POSITIVE sentiment (green smile) reinforcing наш differentiator. Brand-voice match check: ✓. Variant A scores 0.7 (mentioned 80%, position 1.5). Variant B scores 0.4 (mentioned 50%, position 3.2). Same length copy — completely different LLM resonance."

**Why це differentiation:** Peec.ai charges €85+/mo для це surface (visibility/position/sentiment) тільки. Ми build native + add counter-draft generation that Peec не має. "We measure what Peec measures + we generate the response Peec doesn't."

### Out of scope (deferred to post-hackathon)

| Pipeline / feature | Why cut |
|---|---|
| W6 (voice morning brief) — Telli + ElevenLabs | Risk > value live demo; marketer flagged as theater; fallback chain anti-climactic |
| W4 (public widget) — `/widget/[brand]` | Theater per marketer; iframe CSP + narrative existence + render = 3 things break |
| Content generation як окремий pipeline | Overlaps з counter-draft generation у W9 |
| Slack notification | OAuth + workspace setup, 1-2h, deferred |
| HubSpot/CMS integration | Week of work each |
| Persona-aware W5 (CTO vs CFO query variants) | 1-2h, не у budget today |
| Multi-language / multi-region | New pipeline (W10) |
| Effectiveness measurement layer (mention-rate delta over time) | Needs historical data, not viable day 1 |
| Multi-tenancy / agencies | Multi-org admin UI = week |
| Legal review gate / fact-check layer | Critical for fintech post-monetization, not for hackathon brand |
| Real-time Supabase channels | Polling (5s) is fine для demo |
| pgvector embeddings + dedup | Не критично для 1-day demo, додаємо post-hackathon |
| RLS policies окрім public-demo | Single-tenant для demo, повне RLS додаємо з auth |
| Auth (Supabase Auth + users mirror) | Public demo only |
| `cost_ledger` per-line writes | Aggregated у `runs.stats` для simplification |

## Schema additions

Додаються до `brand-intel/CONTRACTS.md` цим ADR:

1. **`competitors` table** — `relationship enum ('self', 'competitor')`, `homepage_url`, `handles jsonb`, `search_terms text[]`. W9 reads це для scrape list.
2. **`runs.stats jsonb`** — per-run aggregated stats (scanned/signals/drafts/cost) для audit panel.
3. **`narrative_variants` table** — окрема (зараз schema живе всередині simulator output Zod, треба persist row).

`signal_source_type` enum НЕ змінюється — `competitor` залишається. Розрізнення self vs competitor живе у `competitors.relationship`, signal joins на competitors через `competitor_id`.

## Consequences

**Plus:**
- Realistic 11h budget з headroom для bug fixing + dry-runs.
- Demo flow tight (4 min): "Run radar" → see signals → approve/copy draft → "Simulate alternatives" → ranked variants → cost badge anchors trust.
- Marketer's 5 з 7 critical UX gaps fix'аються light versions (approval queue, onboarding read-only, audit panel, all-severity visibility, email digest preview).
- Marketer's round-2 #1 (cost transparency) + #2 (self-monitoring) added.

**Minus:**
- Voice angle drop'ається. Якщо журі питає "де голос" — answer: "Deliberate cut. Telli adds 30%+ failure risk live demo. Voice delivery is feature, not differentiation. Reaction loop = real value."
- Widget drop'ається. Якщо журі питає — same argument: "Public widget is theater. Reaction loop > public display для proving CMO value."
- Self-monitoring у scope але не highlighted у demo flow. Згадуємо у Q&A якщо релевантно: "Same machinery handles our own brand crisis comms — competitor radar generalizes to self-radar."

## External feedback summary

Marketer Round 2 hackathon-relevant items adopted:

| Item | Status |
|---|---|
| Cost badge | **Adopted** (runs.stats.cost_usd_cents → dashboard badge) |
| Self-monitoring (crisis comms) | **Adopted** (competitors.relationship='self') |
| Persona-aware W5 (CTO/CFO variants) | Deferred (1-2h не у budget) |
| Slack notification | Deferred (OAuth complexity) |
| Measurement layer | Deferred (needs historical data) |

Marketer roadmap (must-haves post-hackathon, ranked):
1. Measurement layer (LLM share-of-voice delta over time)
2. Slack + HubSpot integration
3. Legal review gate + fact-check layer

Marketer pre-launch risks:
1. Classifier brittleness (false positives/negatives) → seed з 100 hand-labeled signals від first 3 customers
2. Over-promise on LLM speed (lag = weeks, не days) → set expectations у onboarding
3. Brand voice misalignment ("AI feel") → fine-tune LLM з brand voice examples перед production

## Reassess

- **2026-04-26:** Post-hackathon retro у `decisions/2026-04-26-post-hackathon-retro.md`. Reassess чи voice/widget actually rank higher за marketer's roadmap items.
- **Trigger reassess раніше:** якщо post-hackathon survey від журі / first 3 prospects shows >70% asking для voice/widget specifically, переглянути priorities.
