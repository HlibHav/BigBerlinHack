---
date: 2026-04-25
status: partially superseded
topic: BBH as intelligence layer over Peec MCP
supersedes: partial — Peec sections of decisions/2026-04-25-hackathon-scope-cut.md
superseded_by: 2026-04-25-mcp-only-peec-attio-demo.md (Peec REST API sections + demo brand sections)
adr_ref: brand-intel/ARCHITECTURE.md §1 + brand-intel/PIPELINES.md
---

> **2026-04-25 update (later same day):** Peec REST API sections + demo brand sections superseded by `2026-04-25-mcp-only-peec-attio-demo.md`. Reason: discovery that MCP Challenge provides MCP-only access (browser OAuth via Claude Code), no REST API key. Server-side cron не може OAuth'итись → strategy moves to manual snapshot pull у Claude Code session, persisted у `data/peec-snapshot.json`. Demo brand pivots з BBH self-promo на Attio (одна з 3 готових Peec test projects). Решта decisions цього ADR (overlay positioning vision, 5 pipelines, sentiment+position adoption, schema additions) — authoritative.

# Peec MCP як primary data source — BBH стає intelligence layer

## Context

`decisions/2026-04-25-hackathon-scope-cut.md` (earlier the same day) put Peec у `[DEFERRED]` через assumed paid tier complexity. Web research під час доби розкрила:

- Peec.ai runs **MCP Challenge** (peec.ai/mcp-challenge) — week-long build sprint, $9,500+ prize pool, deadline 2026-04-26.
- Participants get **30-day free trial** + free unlimited MCP access via `https://api.peec.ai/mcp`.
- Judges = Peec themselves. Optimization criterion = "repeatable workflow powered by Peec MCP that solves real marketer problem."

Marketer round-2 feedback окремо validated що "we replicate what Peec does ourselves" thinking was wrong framing — Peec already does visibility/position/sentiment/citation tracking across 6 LLMs natively. Building parallel infrastructure = wasted effort. Better — leverage Peec для data layer + add intelligence layer above.

## Decision

**BBH = intelligence layer над Peec MCP. Peec sees the brand pulse. BBH closes the loop (classify → respond → multi-channel expand → daily digest → human approve).**

### Position pitch

"Most teams в MCP Challenge will show pretty dashboards on top of Peec. BBH closes the cycle: Peec data → severity classification → counter-narrative → simulator → multi-channel content → daily Slack brief → human approval. We do what Peec doesn't: turn metrics into actions."

### Five pipelines у hackathon scope

| Pipeline | Що робить | Source |
|---|---|---|
| **W9 Radar** | Peec MCP daily snapshot + Tavily fresh news (between syncs) → delta detect → severity+sentiment classify → if `severity='high'` auto-counter-draft | Peec MCP primary + Tavily supplementary |
| **W5 Simulator** | Own LLM panels (швидкий live response) → ranked positioning variants з position/mention_rate/predicted_sentiment | OpenAI gpt-4o + Anthropic claude-sonnet direct |
| **W7 Multi-channel expand** | Один approved counter-draft → 4 variants: blog post (~800w), X thread (5 tweets), LinkedIn post (~200w), email subject+body | OpenAI/Anthropic |
| **W6′ Morning brief** | Daily 8am UTC text summary (~200w) на основі yesterday's runs+signals+drafts → real Slack send | LLM synthesis + Slack webhook |
| sentiment | Class. dimension across signals/variants | passim, native у W9/W5 |

Cron schedules: W9 cron 2h SLA target post-hackathon (manual trigger демо today); W6′ cron daily 8am UTC post-hackathon (manual "Send now" demo); W5/W7 — on-demand only, no cron.

### Data layering — Peec daily, Tavily 2h

Peec refresh cadence = daily (per pricing tier). Тому:

- **Peec layer (daily background):** "What 6 LLMs say about us + competitors right now." Visibility, position, sentiment, citations. Ground truth для baseline brand pulse.
- **Tavily layer (every 2h cycle target):** "What just happened in the world that might shift LLM perception in coming days." Web/news scraping для breaking content between Peec daily syncs.
- W9 detects deltas FROM EITHER LAYER. Signals get tagged з `source_type ∈ {'peec_delta', 'tavily_news', 'self'}`.

### Sentiment from Peec

Peec gives `sentiment ∈ {positive, neutral, negative}` natively per LLM response. 1:1 mapping до нашого `sentiment_label` enum. Native ingestion — no own classifier needed для Peec-sourced signals. **Own classifier тільки для Tavily-sourced signals і W5/W7 generated content** (predicted_sentiment for brand-voice safety check).

### Position from Peec

Peec gives avg position коли brand listed у LLM responses. Ingest natively as `signals.position numeric` (nullable, only set for Peec-sourced). W5 simulator calculates ourselves для variant scoring (`avg_position` field on `narrative_variants`).

### Demo brand — BBH self-promo

Demo monitors **BBH** (own brand) vs Profound, BrandRank.ai, Mention.com. Notably **Peec.ai is NOT у competitor list** — partnership/judge consideration + we position as complementary not substitutive. Single self-row + 3 competitors у `competitors` table with `relationship` enum (`self` | `competitor`). Tracked Peec prompts (8 generic):

- "best AI brand monitoring tool"
- "tools to track LLM brand mentions"
- "AI search analytics platforms"
- "GEO AEO software comparison"
- "how to monitor ChatGPT brand perception"
- "Profound vs BrandRank vs Mention comparison"
- "competitive intelligence for AI search"
- "automated counter-narrative generation tools"

User overrides у `supabase/seed.sql` if різний brand bажано.

### Send target — Slack only

W6′ daily brief delivered through Slack incoming webhook (`SLACK_WEBHOOK_URL` env var). Email send (Resend) — deferred post-hackathon. W7 multi-channel still generates `email_subject + email_body` як content (user can copy-paste до their email tool), але no auto-send.

### Budget impact

| Block | Pre-pivot | Post-pivot | Δ |
|---|---|---|---|
| Bootstrap | 1.5h | 1.5h | — |
| Migration + seed | 1.4h | 1.4h | — |
| Peec MCP wrapper + sign-up flow | 0 | +0.75h | +0.75h |
| W9 (Peec primary, simpler than Tavily extraction) | 2.2h | 1.75h | -0.45h |
| W5 simulator | 2h | 2h | — |
| **W7 Multi-channel expand** (новий) | 0 | +1h | +1h |
| **W6′ Morning brief Slack send** | 0.3h preview | +0.75h (Slack only, no Resend) | +0.45h |
| Demo UI (5 sections + multi-channel + brief) | 3.4h | 3.7h | +0.3h |
| Polish + dry-run × 3 | 1h | 1h | — |
| **TOTAL** | **~12h** | **~13.85h** | **+1.85h** |

Tight але реалістичний. Per Glib's "не дивись на дедлайн" — proceed.

### What stays IN scope (від попереднього ADR)

- All marketer round-1 fixes (approval queue, audit panel, competitors panel, sentiment chips, position badges, all-severity visibility, footer note про v2 features).
- Self-monitoring через `competitors.relationship='self'`.
- `runs.stats jsonb` + cost badge.
- `narrative_variants` table.
- `sentiment_label` enum + sentiment columns.

### What stays OUT (deferred per попереднього ADR)

- W4 public widget (`/widget/[brand]`).
- Email send via Resend (Slack-only delivery sufficient).
- Telli + ElevenLabs voice integration.
- pgvector embeddings + similarity dedup.
- Multi-tenancy / agencies.
- Persona-aware W5 query variants.
- Multi-language / multi-region.
- Effectiveness measurement layer (mention-rate delta over time).
- Legal review gate / fact-check layer.

## Schema additions

Beyond previous ADR:

1. **`competitors.relationship`** enum extended — already added у попередньому ADR (`'self' | 'competitor'`). Не змінюється тут.
2. **NEW `signals.source_type`** value: extend enum to include `'peec_delta'`. Existing values `'competitor', 'internal', 'external'` залишаються; new value differentiates Peec-sourced vs Tavily-sourced signals.
3. **NEW `signals.position`** numeric nullable. Only populated для `source_type='peec_delta'` signals що include position info from Peec.
4. **NEW `content_variants` table** (W7 output). Per channel:

```
content_variants
├─ id, organization_id, created_at
├─ parent_counter_draft_id (uuid, fk → counter_drafts)
├─ channel (enum: 'blog' | 'x_thread' | 'linkedin' | 'email')
├─ title (text, nullable — only blog has explicit title)
├─ body (text)
├─ metadata (jsonb)            — channel-specific (X thread = array of tweets, email = subject+preheader)
├─ status (enum: 'generated' | 'edited' | 'sent' | 'archived')
└─ run_id (uuid, fk → runs)
```

5. **NEW `brief_deliveries` table** (W6′ tracking):

```
brief_deliveries
├─ id, organization_id, created_at
├─ delivery_date (date)         — yyyy-mm-dd target day для brief
├─ channel (enum: 'slack' | 'email')
├─ recipient (text)             — slack channel id або email address
├─ status (enum: 'queued' | 'sent' | 'failed')
├─ summary_body (text)          — full brief content
├─ sent_at (timestamptz, nullable)
├─ error_reason (text, nullable)
└─ run_id (uuid, fk → runs)
```

## External integration

- **`PEEC_MCP_URL`** = `https://api.peec.ai/mcp`
- **`PEEC_API_KEY`** = bearer token (paid plan / challenge trial)
- **`SLACK_WEBHOOK_URL`** = incoming webhook URL для demo Slack channel
- (Resend, Telli, ElevenLabs — не у hackathon-active set)

## Consequences

**Plus:**
- Better positioning для MCP Challenge judging (Peec themselves, optimize за "powered by Peec MCP").
- Less infrastructure to build ourselves (sentiment + position + citations come natively from Peec).
- Authentic data у demo (not mock) — reinforces trust.
- 5 pipelines = более comprehensive product story.

**Minus:**
- Tighter budget (~14h vs ~12h) — less room for bug fixing або polish.
- Single point of failure — Peec MCP downtime = degraded W9 (mitigation: hybrid fallback to cached fixture, deferred or stretch).
- 30-day trial expires post-demo — production subscription required ($85+/month) for ongoing use. OK для hackathon proof, але recurring revenue impact post-monetization.
- Demo brand changes from "AcmeCloud generic" до "BBH self-promo" — slight reposition meta.

## Reassess

- 2026-04-26 post-hackathon retro: чи Peec dependency ОК на long-term, чи треба data-source diversification (наприклад Profound MCP coming online).
- Якщо post-hackathon survey shows judges valued the integration tightly з Peec — double down. Якщо not — abstract data layer behind interface для swap.
