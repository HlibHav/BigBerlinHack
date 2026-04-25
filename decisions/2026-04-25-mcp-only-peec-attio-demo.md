---
date: 2026-04-25
status: accepted
topic: Peec MCP-only access (no REST API key) + Attio як demo brand
supersedes: 2026-04-25-peec-overlay-pivot.md (Peec REST API sections + demo brand sections only)
superseded_by: none
adr_ref: brand-intel/ARCHITECTURE.md §0,§1,§10 + brand-intel/CONTRACTS.md §6.1 + brand-intel/PIPELINES.md §W9
post_hackathon_reassess: 2026-04-26
---

# Peec MCP-only через Claude Code snapshot + demo brand = Attio

## Context

`decisions/2026-04-25-peec-overlay-pivot.md` (earlier the same day) положив Peec як primary data source через assumption що `https://api.peec.ai/mcp` дає free unlimited REST API access via mcp-challenge program. Подальше investigation web docs (peec.ai/mcp/introduction + mcp/setup + mcp/tools.md) виявило:

- **Peec MCP Challenge participants** мають access **тільки через MCP protocol** (browser OAuth flow). Не отримують REST API key (`x-api-key` header endpoint `https://api.peec.ai/customer/v1/*`).
- **REST API доступний тільки на Enterprise tier** (custom pricing, не у Challenge).
- **MCP browser OAuth flow** — interactive only. Server-side code (Inngest functions у Vercel cron, нічний batch) не має browser → не може OAuth'итись.

Окремо, MCP Challenge не дозволяє користуватись довільним brand'ом — учасники працюють з готовими **test projects** які Peec надає для трьох example brands:
- **Attio** (B2B SaaS, "modern flexible CRM") vs Salesforce + HubSpot
- Nothing Phone vs Apple + Samsung
- BYD vs Tesla + Legacy automakers

Demo brand з попереднього ADR ("BBH self-promo") не присутній у Peec test projects — тому live Peec data для нашого власного brand'у недоступна.

## Decision

**1. Peec data — pulled via Claude Code MCP session, persisted у repo як snapshot file. Server-side pipeline reads snapshot, не live API.**

Конкретно:
- Claude Code session (як зараз) кличе Peec MCP tools (`list_projects`, `list_brands`, `get_brand_report`, `list_chats`, `get_chat`, `get_url_report`, `get_actions`).
- Result dumped у `data/peec-snapshot.json` (committed у git, не secret).
- Inngest functions (W9 radar, W6′ morning brief) читають JSON snapshot через `lib/services/peec-snapshot.ts` loader.
- Refresh workflow: Glib запускає Claude Code session → команда `refresh peec snapshot` → script `scripts/_peec-pull.ts` re-pull'ить через MCP → overwrite JSON → commit.

**2. Demo brand pivots з "BBH self-promo" на "Attio (vs Salesforce + HubSpot)".**

Ця test project shared з усіма MCP Challenge participants. Peec test project уже має:
- Brands: Attio (own), Salesforce, HubSpot
- Tracked prompts (CRM/business software queries)
- 7+ days of historical brand reports з visibility/sentiment/position
- Citation tracking via `get_url_report`

Attio — найкращий fit з 3 опцій бо B2B SaaS positioning ("modern flexible CRM alternative") близьке до нашого CMO/marketer audience. Counter-drafts логічні (порівняння з incumbents); demo flow зрозумілий журі без extensive product background.

## What changes у архітектурі

| Aspect | Before (overlay-pivot ADR) | After (this ADR) |
|---|---|---|
| Peec auth | `x-api-key` REST header | MCP browser OAuth (Claude Code) |
| Peec endpoint | `https://api.peec.ai/customer/v1/*` REST | `https://api.peec.ai/mcp` MCP server |
| Peec call site | Server-side Inngest function (live) | Claude Code session (manual snapshot) |
| `lib/mcp/peec.ts` | REST client з cost recording | renamed → `lib/services/peec-snapshot.ts` (JSON loader) |
| W9 step `peec-snapshot` | Live REST `getBrandReport` | `peec-load-snapshot` reads JSON file |
| W9 step `peec-delta-detect` | Diff vs previous run | Diff within snapshot history (7d window) |
| .env vars | `PEEC_API_KEY`, `PEEC_API_BASE`, `PEEC_PROJECT_ID` | `PEEC_SNAPSHOT_PATH=./data/peec-snapshot.json` |
| Demo brand UUID | `00000000-0000-0000-0000-000000000bbh` (BBH) | `00000000-0000-0000-0000-00000000a771` (Attio) |
| Demo brand slug | `bbh` | `attio` |
| Demo competitors | Profound, BrandRank.ai, Mention.com | Salesforce, HubSpot |
| Demo URL | `/demo/bbh` | `/demo/attio` |
| Self-monitoring demo angle | Active (BBH self) | Deferred (Attio scenario не has self-monitoring story) |
| Refresh cadence | Live cron 2h SLA target | Manual via Claude Code session, on-demand |

## Demo angle reframe

**Was:** "BBH calls Peec MCP live each radar tick → severity classify → counter-draft."

**Is:** "BBH reads Peec brand pulse (synced through MCP via Claude Code session — same authoring tool you use). When ranges shift in the snapshot, BBH classifies severity, generates counter-drafts. Demo shows real Attio data captured моментально перед demo. Refresh cadence — daily через MCP session push (production cadence — paid REST tier коли monetization)."

Це — частина чесна, частина positioning. Журі MCP Challenge — Peec themselves. Вони знають про MCP capabilities exactly. Чесна framing ("MCP-driven snapshot, не live API call") rates better за overpromised "live integration" що визибрається при questioning.

## Consequences

**Plus:**
- No billing concerns — MCP Challenge free access вистачає.
- Real Peec data у demo (3 brands × 7d × visibility/sentiment/position).
- Aligns з Challenge spirit ("powered by Peec MCP" tooling).
- Demo brand Attio — well-known у B2B SaaS world, журі context'ять одразу.
- Peec MCP team бачить що ми build'имо ON TOP of MCP, не replicate.

**Minus:**
- Peec data — snapshot, не live. Refresh manual.
- Demo angle "live API call" треба reframe (transparency — likely net positive за MCP Challenge specifically).
- "Self-monitoring crisis comms" demo angle відкладається — Attio scenario не має storyline для own-brand crisis.
- Якщо Peec test project shape змінюється — наш `data/peec-snapshot.json` schema може drift. Mitigation: Zod schema parse before W9 use; refresh on first failure.
- Production монetization story потребує REST API access (Enterprise tier €custom). Post-hackathon decision.

## Schema impact

- `signals.source_type` enum — без змін (`'peec_delta'` залишається; означає "delta detected у Peec snapshot history" замість "live REST call").
- `signals.position` numeric nullable — без змін.
- `evidence_refs` для Peec-sourced signals — пишемо `["peec-snapshot:2026-04-25T08:00Z", "https://app.peec.ai/projects/{p}/brands/{b}"]` замість live API URL.
- Нова Zod schema `lib/schemas/peec-snapshot.ts` для контракту з snapshot file.
- `cost_service` enum — `'peec'` залишається (cost tracking логіка для post-hackathon).

## External integration

- `PEEC_MCP_URL` = `https://api.peec.ai/mcp` (для Claude Code config, не для server-side code)
- `PEEC_SNAPSHOT_PATH` = `./data/peec-snapshot.json` (server reads це)
- `PEEC_API_KEY` — DROPPED. Не потрібен.
- `PEEC_API_BASE` — DROPPED. Не потрібен.
- `PEEC_PROJECT_ID` — captured у snapshot file, не env var.

## Setup steps (одноразово)

1. Glib додає Peec MCP server у Claude Code config: через `/mcp` slash command або `~/.claude.json` додає `peec` server pointing to `https://api.peec.ai/mcp`.
2. Glib проходить browser OAuth flow коли Claude Code prompt'ить.
3. Я (Claude Code session) викликаю `mcp__peec__list_projects` → знаходжу Attio test project → captures project_id.
4. Я викликаю `mcp__peec__list_brands(project_id)` → 3 brand_ids (Attio, Salesforce, HubSpot).
5. Я викликаю `mcp__peec__get_brand_report(project_id, start=7d ago, end=today)` → визначаю brand reports.
6. Я викликаю `mcp__peec__list_chats` + `mcp__peec__get_chat` для top 10 chats → evidence_refs source.
7. Я викликаю `mcp__peec__get_url_report` → cited URLs.
8. Я викликаю `mcp__peec__get_actions(scope='owned')` → Peec recommendations для UI showcase.
9. Compile усе у `data/peec-snapshot.json`. Commit.

## Refresh workflow

Перед demo (T-2h):
```
Glib opens Claude Code session у репо.
Glib types: "refresh peec snapshot"
Я: re-execute steps 3-9 above. Overwrite JSON. Git commit + push.
```

Якщо Peec test project недоступний (Glib's account не реєстрований у MCP Challenge):
- Fallback: hand-craft realistic fixture у `data/peec-snapshot.json` based на public Attio/Salesforce/HubSpot info (homepage messaging, pricing pages, recent blog posts via Tavily). Demo angle стає "synthetic Peec-shaped data, не real Peec call" — менш потужно але working.

## Reassess

- **2026-04-26 post-hackathon retro:** Чи Peec MCP-only access обмежує post-hackathon production roadmap? Якщо paying €custom для Enterprise tier є viable monetization, повертаємось до live REST.
- **Якщо Peec post-Challenge продовжує free MCP access** — продовжуємо as-is для production (snapshot refresh з cron у Claude Code Cloud cron коли available).
- **Якщо Glib's Peec account не реєстрований у MCP Challenge** — fallback на hand-crafted fixture; revisit demo brand strategy для production.
