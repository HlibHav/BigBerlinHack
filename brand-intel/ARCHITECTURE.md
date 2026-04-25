# Architecture

> Як BBH виглядає як система. Reference docs: topology, request flow, component layers, pipeline architecture, Supabase schema overview, multi-brand ізоляція, evidence chain.

**Version:** 2026-04-25 rev2 (Peec MCP-only access via Claude Code snapshot; demo brand = Attio). Попередня plugin-era версія — `_archive/ARCHITECTURE.md`. Hackathon decisions — `decisions/2026-04-25-hackathon-scope-cut.md` + `decisions/2026-04-25-peec-overlay-pivot.md` (overlay vision authoritative; REST + demo brand sections superseded by `decisions/2026-04-25-mcp-only-peec-attio-demo.md`).

---

## 0. Hackathon scope (2026-04-25) — what's actually built today

Цей файл — full architectural reference. На день хакатону **build'имо вузький subset**: W9 + W5 + W7 + W6′ + dashboard з UX patches.

**Demo brand:** **Attio (vs Salesforce + HubSpot)** — одна з 3 готових Peec MCP Challenge test projects. Per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`, demo brand змінений з "BBH self-promo" на Attio бо Peec REST API недоступний для Challenge participants — використовуємо тільки MCP browser OAuth у Claude Code, тож працюємо з готовими test projects.

**In scope today (4 pipelines + UX patches):**
- **W9 `competitor-radar`** — Peec snapshot ingest (з `data/peec-snapshot.json`, refreshed manually via Claude Code session) + Tavily fresh news (supplementary, live). Delta detect → severity+sentiment classify → if `severity='high'` auto-counter-draft. Manual trigger demo today.
- **W5 `narrative-simulator`** — own LLM panels (gpt-4o + claude-sonnet). Outputs include avg_position, mention_rate, predicted_sentiment. On-demand trigger.
- **W7 `content-expand`** — один approved counter-draft → 4 channel variants (blog ~800w, X thread 5 tweets, LinkedIn ~200w, email subject+body). Auto-trigger після counter-draft approval.
- **W6′ `morning-brief`** — daily 8am UTC LLM-synthesized 200w summary → real Slack send via incoming webhook. Cron post-hackathon, manual "Send now" button demo today.
- `/demo/[brand]` dashboard з 7 sections (audit, competitors, signals, drafts queue, simulator outputs, multi-channel content, morning brief).
- `competitors` table з `relationship='self'|'competitor'` (self-monitoring через ту саму machinery).
- `runs.stats jsonb` для audit panel + cost badge.
- `narrative_variants` + `content_variants` + `brief_deliveries` tables.
- `sentiment_label` enum + sentiment columns на `signals` (з Peec natively для peec_delta або own LLM для tavily-sourced) і `narrative_variants` (predicted_sentiment).
- `signals.position` numeric (Peec-only, null for Tavily-sourced).

**Deferred (preserved у docs, не у migration 0000):**
- W4 public widget (`/widget/[brand]`).
- W6 voice morning brief (Telli + ElevenLabs voice delivery) — superseded by W6′ Slack text version.
- Email send (Resend) — Slack-only delivery sufficient для hackathon.
- `voice_call_results` table.
- Firecrawl integration (Tavily covers between Peec syncs).
- Auth + multi-org RLS — public demo only сьогодні.
- pgvector embeddings + similarity dedup — обходимо у v1.
- `cost_ledger` per-line rows — aggregated через `runs.stats.cost_usd_cents`.
- Per-timezone brief scheduling — fixed 8am UTC.
- Per-variant approval workflow (W7) — parent approval auto-spawns variants.

Decision rationale → `decisions/2026-04-25-hackathon-scope-cut.md`. Marketer feedback що drove cuts → `feedback/marketer-2026-04-25.md`.

Решта секцій нижче описують **повну системну архітектуру** (post-hackathon target). Якщо щось `[DEFERRED]` — це reference, не current build.

---

## 1. System topology

```
┌──────────────────────────────────────────────────────────────────┐
│  BROWSERS / EMBEDS                                               │
│  ├─ /demo/{brand}          (public demo dashboard, mobile-first) │
│  ├─ /widget/{brand}        (embeddable iframe, standalone)       │
│  └─ /dashboard/{brand}     (private, auth-gated, post-demo)      │
└────────────────┬─────────────────────────────────────────────────┘
                 │ HTTPS
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  VERCEL (Next.js 14 App Router)                                  │
│  ├─ Server Components      (SSR pages, RSC data fetching)        │
│  ├─ Route handlers         (/api/inngest, /api/webhooks/*)       │
│  ├─ Server Actions         (form submit → mutation)              │
│  └─ Edge middleware        (auth gate, rate limit)               │
└────────────┬──────────────────────────────┬──────────────────────┘
             │                              │
             │ Supabase JS client           │ Inngest client
             │ (SSR: service role          │ (event emit)
             │  RLS-enforced via JWT)       │
             ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│  SUPABASE (eu-west-1)    │   │  INNGEST CLOUD                   │
│  ├─ Postgres + RLS        │   │  ├─ Event queue                   │
│  ├─ pgvector (1536 dim)   │◄──┤  ├─ Step orchestration            │
│  ├─ Auth (JWT)            │   │  ├─ Retry/backoff/dedup           │
│  ├─ Storage buckets       │   │  └─ Webhook → /api/inngest        │
│  └─ Edge Functions (n/a)  │   └──────────┬───────────────────────┘
└──────────────────────────┘              │ MCP calls (server-side)
                                          ▼
                     ┌────────────────────────────────────────────┐
                     │  EXTERNAL SERVICES                         │
                     │  ├─ Peec — via SNAPSHOT FILE               │  ← hackathon (PRIMARY)
                     │  │     data/peec-snapshot.json (committed) │
                     │  │     refreshed manually via Claude Code  │
                     │  │     session calling mcp__peec__* tools  │
                     │  ├─ Tavily    — live web/news search       │  ← hackathon (live API)
                     │  ├─ OpenAI / Anthropic — LLM + embeddings │  ← hackathon
                     │  ├─ Slack incoming webhook — W6′ delivery  │  ← hackathon
                     │  ├─ Firecrawl — scrape / extract           │  [DEFERRED — Tavily covers]
                     │  ├─ Resend    — email delivery             │  [DEFERRED — Slack only]
                     │  ├─ Telli     — voice-agent calls          │  [DEFERRED — W6 superseded by W6′]
                     │  └─ ElevenLabs — TTS fallback              │  [DEFERRED — W6 cut]
                     └────────────────────────────────────────────┘
```

**Three moving parts** які треба тримати синхронізованими:

1. **Vercel** обслуговує HTTP (pages + route handlers + server actions). Stateless — state живе у Supabase.
2. **Supabase** — єдине джерело істини для state (Postgres rows, Storage objects, Auth sessions). Розміщений у eu-west-1 для GDPR proximity до користувачів.
3. **Inngest** — durable orchestration. Події летять з Vercel (через `inngest.send()`) → Inngest приймає → кличе назад Vercel endpoint `/api/inngest` для виконання step'ів → кожен step hit'ає Supabase + MCP.

---

## 2. Request flow

### Public widget (W4) — SSR + periodic refresh `[FULL DESIGN — DEFERRED post-hackathon]`

1. Browser embed: `<iframe src="https://bbh-brown.vercel.app/widget/{brand_id}">`.
2. Vercel edge middleware: дозволяє iframe (Content-Security-Policy relaxed для `/widget/*`).
3. Server Component `app/widget/[brand]/page.tsx`:
   - `createClient({ cookies })` (anon client).
   - Query: `supabase.from('narratives').select('...').eq('organization_id', brand).eq('is_public', true).order('generated_at desc').limit(1)`.
   - RLS policy `narratives_public_demo` пропускає anon read для `organization_id = DEMO_BRAND_ID`.
   - Render HTML без client hydration (pure RSC).
4. Cache: Next.js `revalidate = 300` (5 хв) + `unstable_cache({ tags: ['narrative:' + brand] })` на query.
5. Revalidate trigger: W4 pipeline закінчує INSERT нового narrative → `revalidateTag('narrative:' + brand)` у server action.

### Demo dashboard (`/demo/{brand}`) — SSR + client hydration

1. Server Component fetches: 7-day snapshots, 10 recent signals, active counter-drafts, latest morning brief.
2. Client Component `CounterDraftApprovalForm` (`"use client"`) — form для approve/reject. Server action INSERT'ить update.
3. Progressive enhancement: без JS dashboard відкриється read-only.

### Webhook (Telli → `/api/webhooks/telli`) `[DEFERRED — W6 voice cut by hackathon scope]`

1. POST з signature header.
2. Route handler: verify HMAC signature (див. `CONTRACTS.md#webhook-signatures`).
3. Parse body через Zod `TelliWebhookSchema`.
4. If `event_type === 'call.completed'` → INSERT `voice_call_results` row + emit Inngest event `morning-brief.delivered`.
5. Return 200 within 3s (Telli retries past that).

### Scheduled pipeline (Inngest)

1. Inngest cron (post-hackathon): `0 8 * * *` UTC daily → emit `morning-brief.tick` per org. Hackathon — manual trigger via "Send today's brief now" button.
2. Inngest → POST `/api/inngest` з event payload.
3. `/api/inngest` route handler dispatch'ить у `inngest/functions/morning-brief.ts` (W6′ Slack version).
4. Function виконується як series of `step.run(...)` — кожен retry незалежно.
5. Final step: `persist-run` INSERT'ить row у `runs` table.

---

## 3. Next.js component layers

### Server Components (default)

- `app/demo/[brand]/page.tsx`, `app/widget/[brand]/page.tsx` — top-level pages.
- Всі data fetching тут (Supabase query в async component).
- Не використовують React hooks, не мають `onClick`, не імпортують client-only libs.
- Можуть імпортувати Client Components — вони hydrate'аться при render'і.

### Client Components (`"use client"`)

- Форми з validation (react-hook-form + Zod).
- Інтерактивні widget states (toggle, modal, dropdown).
- Real-time subscriptions через `supabase.channel(...)` (post-demo).

### Route handlers (`app/api/**/route.ts`)

- `/api/inngest` — Inngest serve endpoint (`serve({ functions, client })`).
- `/api/webhooks/telli` — Telli callback receiver. `[DEFERRED — W6 voice cut]`
- `/api/webhooks/peec` — Peec push notifications. `[DEFERRED — Peec is MCP-only via Claude Code snapshot, no webhook surface needed; per decisions/2026-04-25-mcp-only-peec-attio-demo.md]`

### Server Actions (`"use server"`)

- Counter-draft approve/reject.
- Manual trigger кнопок у dashboard ("Run radar now").
- Minimal payload: action validates Zod → Supabase mutation → `revalidateTag(...)`.

### Middleware (`middleware.ts`)

- Auth gate для `/dashboard/*` (post-demo).
- Iframe-friendly headers для `/widget/*` (CSP без `frame-ancestors`).
- Rate limit для `/api/webhooks/*` (пам'ятати: signature verify — окремий шар).

---

## 4. Inngest pipeline architecture

### Events (single source of truth: `lib/events.ts`)

```ts
// ACTIVE — W6′ Slack send (call_preference="markdown" path); voice paths [DEFERRED post-hackathon]
export const MorningBriefTick = z.object({
  organization_id: z.string().uuid(),
  run_window_start: z.string().datetime(),
  call_preference: z.enum(["voice-agent", "tts", "markdown"]),
});

// ACTIVE — W9 competitor radar
export const CompetitorRadarTick = z.object({
  organization_id: z.string().uuid(),
  sweep_window_hours: z.number().int().positive().default(6),
});

// ACTIVE — W5 narrative simulator
export const NarrativeSimulateRequest = z.object({
  organization_id: z.string().uuid(),
  seed_type: z.enum(["competitor-move", "user-prompt"]),
  seed_payload: z.record(z.unknown()),
  requested_by: z.string().uuid().nullable(),
});

// [DEFERRED — W4 widget cut; preserved for post-hackathon reactivation]
export const WidgetRegenerate = z.object({
  organization_id: z.string().uuid(),
  reason: z.enum(["new-snapshot", "manual", "schedule"]),
});
```

### Functions (1:1 з pipeline)

Кожна функція живе у `inngest/functions/{name}.ts`:

| Function | Trigger | Approx steps | Cost envelope | Hackathon status |
|----------|---------|--------------|---------------|------------------|
| `competitor-radar` (W9) | manual demo / `competitor-radar.tick` cron 2h post | load-competitors → peec-mcp-fetch (primary) → tavily-supplementary → delta-detect → llm-classify (severity+sentiment) → if-high-llm-draft → aggregate-stats → persist-run | ~$0.06/run | **IN (PRIMARY)** |
| `narrative-simulator` (W5) | `narrative.simulate-request` on-demand | load-seed-context → generate-3-variants → run-prompts (5×2 models) → score-and-rank (mention_rate/avg_position/predicted_sentiment) → persist-variants → persist-run | ~$0.04/run | **IN** |
| `content-expand` (W7) | counter-draft approval (auto-trigger) | load-context → expand-blog → expand-x-thread → expand-linkedin → expand-email → persist-variants → persist-run | ~$0.05/run | **IN** |
| `morning-brief` (W6′) | manual demo / cron 0 8 * * * UTC post | gather-yesterday → synthesize-brief → format-slack-blocks → send-slack → persist-delivery → persist-run | ~$0.005/run | **IN** |
| `morning-brief-voice` (W6) | — | (Telli voice path) | — | **[DEFERRED]** |
| `widget-regenerate` (W4) | — | — | — | **[DEFERRED]** |

### Step pattern (ідіоматичний — full-design example, voice path `[DEFERRED]`)

```ts
// Illustrative example (full design). Hackathon W6′ uses Slack delivery замість voice/TTS:
//   const delivery = await step.run("send-slack", () => sendBriefToSlack(briefText));
export const morningBrief = inngest.createFunction(
  { id: "morning-brief", retries: 3 },
  { event: "morning-brief.tick" },
  async ({ event, step }) => {
    const snapshots = await step.run("fetch-snapshots", () =>
      getSnapshotsForBrand(event.data.organization_id, event.data.run_window_start)
    );
    const embedded = await step.run("embed-content", () =>
      embedWithOpenAI(snapshots)
    );
    const briefText = await step.run("synthesize", () =>
      synthesizeWithLLM(embedded, MorningBriefOutputSchema)
    );
    const delivery = await step.run("deliver", () =>
      deliverViaTelliOrFallback(briefText, event.data.call_preference)  // [DEFERRED — hackathon W6′ uses Slack]
    );
    await step.run("persist-run", () =>
      insertRun({ organization_id: event.data.organization_id, ok: true, ... })
    );
    return { briefText, delivery };
  }
);
```

Ключові властивості:
- **Idempotent** — кожен `step.run(id, ...)` кешує результат по id; retry не перезапускає попередні steps.
- **Named** — id видно у Inngest UI trace. Debugging — дивишся хто впав, retry'їш той step окремо.
- **Zod-gated** — LLM calls огорнуті у `generateObject({ schema: ... })` (Vercel AI SDK) або equivalent.
- **Cost-logged** — `step.run("log-cost", () => insertCostLedger(...))` після expensive calls.

### Коли spawn'ити окрему function vs inline step

Див. `decisions/2026-04-24-subagent-boundary.md`. Три критерії для окремої function:
1. **Parallelism** — треба запускати паралельно (fan-out).
2. **Context bloat** — окремий function має свою own memory, не тягне parent context.
3. **Self-contained contract** — зрозумілий Zod event + зрозумілий Zod result.

Default — inline `step.run(...)`. Overhead окремих functions виправданий тільки коли усі 3 критерії.

---

## 5. Supabase schema overview

Повний DDL — `CONTRACTS.md#database-schema`. Тут — mental model.

### Core tables

```
organizations
├─ id (uuid, pk)
├─ slug (text, unique)                 — URL-safe brand identifier
├─ display_name (text)
├─ local_timezone (text)               — "Europe/Kyiv" для W6 scheduling [DEFERRED]
├─ voice_call_preference (enum)        — "voice-agent" | "tts" | "markdown" [DEFERRED]
├─ is_public_demo (bool)               — true для DEMO_BRAND_ID
└─ created_at, updated_at

users (Supabase Auth schema + public.users mirror)
└─ organization_id (uuid, fk → organizations)

competitors                             — W9 scrape list + onboarding source
├─ id, organization_id, created_at
├─ display_name (text)
├─ relationship (text: 'self' | 'competitor')   — self enables crisis-comms через ту саму machinery
├─ homepage_url (text, nullable)
├─ handles (jsonb)                     — {twitter, linkedin, github, ...}
├─ search_terms (text[])               — для Tavily query construction
└─ is_active (bool)

snapshots
├─ id, organization_id, created_at
├─ captured_at (timestamptz)
├─ prompt (text)                       — що запитували у LLM
├─ model (text)                        — "gpt-4", "claude-opus-4-7"
├─ response_text (text)
├─ embedding (vector(1536))
└─ source_mcp (text)                   — "peec", "internal"

citations (many-to-one snapshots)
├─ id, organization_id, created_at
├─ snapshot_id (uuid, fk)
├─ url (text)
├─ title (text)
├─ excerpt (text)
└─ embedding (vector(1536))

signals
├─ id, organization_id, created_at
├─ competitor_id (uuid, fk → competitors, nullable)   — link до scrape source
├─ source_type (enum: "competitor", "internal", "external", "peec_delta")
├─ source_url (text)
├─ severity (enum: "low", "med", "high")              — impact: how big a deal
├─ sentiment (enum: "positive", "neutral", "negative") — tone for audience (orthogonal до severity)
├─ summary (text)
├─ evidence_refs (text[])              — ≥1 URL
├─ embedding (vector(1536))            — [DEFERRED post-hackathon]
├─ auto_draft (bool)                   — true тільки якщо severity=high
└─ run_id (uuid)                       — backfill після persist-run; FK додаємо post-hackathon

counter_drafts
├─ id, organization_id, created_at, updated_at
├─ signal_id (uuid, fk → signals)
├─ status (enum: "draft", "approved", "rejected", "published")
├─ body (text)                         — draft post/tweet/thread
├─ channel_hint (enum: "x", "linkedin", "blog", "multi")
├─ tone_pillar (text)                  — яка tone pillar використана
├─ evidence_refs (text[])
└─ reviewed_by (uuid, fk → users, nullable)

narratives
├─ id, organization_id, created_at
├─ generated_at (timestamptz)
├─ summary_markdown (text)             — що LLM говорять про нас сьогодні
├─ citation_ids (uuid[])
├─ is_public (bool)                    — показувати у /widget
└─ embedding (vector(1536))

runs (audit log)
├─ id, organization_id, created_at
├─ function_name (text)                — "competitor-radar", "narrative-simulator", ...
├─ event_payload (jsonb)
├─ ok (bool)
├─ reason (text, nullable)             — якщо ok=false
├─ stats (jsonb, nullable)             — RunStatsSchema: sources_scanned, signals_by_severity, drafts_generated, cost_usd_cents
└─ started_at, finished_at

narrative_variants                      — W5 simulator output, persisted per run
├─ id, organization_id, created_at
├─ simulator_run_id (uuid, fk → runs)
├─ seed_signal_id (uuid, fk → signals, nullable)
├─ seed_counter_draft_id (uuid, fk → counter_drafts, nullable)
├─ rank (int, 1-5)
├─ body (text)
├─ score (numeric 0-1)                   — formula: mention_rate × (1 / avg_position)
├─ score_reasoning (text)
├─ predicted_sentiment (enum)           — pos/neutral/neg of variant text itself (brand-voice safety check)
├─ avg_position (numeric, nullable)     — avg rank коли LLM lists brands; null = never mentioned
├─ mention_rate (numeric 0-1)           — fraction of test prompts where brand mentioned
└─ evidence_refs (text[])

content_variants                        — W7 multi-channel expansion output
├─ id, organization_id, created_at
├─ parent_counter_draft_id (uuid, fk → counter_drafts) — one approved → 4 variants
├─ channel (enum: 'blog' | 'x_thread' | 'linkedin' | 'email')
├─ title (text, nullable)               — only blog has title
├─ body (text)
├─ metadata (jsonb)                     — channel-specific {tweets[], hashtags[], subject, preheader, ...}
├─ status (enum: 'generated' | 'edited' | 'sent' | 'archived')
├─ evidence_refs (text[])
└─ run_id (uuid)
   UNIQUE (parent_counter_draft_id, channel)

brief_deliveries                        — W6′ Slack/email send tracking
├─ id, organization_id, created_at
├─ delivery_date (date)
├─ channel (enum: 'slack' | 'email')
├─ recipient (text)                     — Slack channel id або email address
├─ status (enum: 'queued' | 'sent' | 'failed')
├─ summary_body (text)                  — full markdown brief
├─ sent_at (timestamptz, nullable)
├─ error_reason (text, nullable)
└─ run_id (uuid)

cost_ledger
├─ id, organization_id, created_at
├─ service (enum: "openai", "anthropic", "peec", "tavily", "firecrawl", "telli", "elevenlabs")
├─ operation (text)                    — "embed", "completion", "call", ...
├─ tokens_or_units (integer)
├─ usd_cents (integer)
└─ run_id (uuid, fk → runs, nullable)

voice_call_results (W6-specific)        — [DEFERRED post-hackathon, schema у CONTRACTS.md preserved]
├─ id, organization_id, created_at
├─ run_id (uuid, fk → runs)
├─ provider (enum: "telli", "elevenlabs")
├─ call_id (text)
├─ duration_seconds (integer, nullable)
├─ transcript (text, nullable)
├─ audio_storage_path (text)           — Storage bucket path
└─ outcome (enum: "answered", "voicemail", "failed")
```

### pgvector strategy

- **Embedding model:** OpenAI `text-embedding-3-small` (1536 dim, $0.02/M tokens).
- **Generation:** у `step.run("embed-content", ...)` перед INSERT. Never generate embedding у client.
- **Index choice:**
  - `IVFFlat` до 10k rows (швидше build, gorszy recall tradeoff).
  - `HNSW` від 10k+ (slower build, better recall at scale).
  - Threshold — hypothesis, revisit коли demo brand перевалить 1k snapshots (див. `knowledge/architecture/hypotheses.md`).
- **Usage:**
  - Dedup у W9: нові signals → `<-> embedding < 0.15` по 30-day window → skip if match.
  - Clustering у W4: narratives агрегуються по snapshot similarity (same theme group).
  - Similar-past-brief lookup у W6: уникати повторювання вчорашнього content'у.

### Enums

Тримаємо як Postgres enums, регенеруємо TS types через `supabase gen types typescript`. Це каскадно типізує Zod schemas і React props без manual sync'у.

---

## 6. Multi-brand isolation

Три шари захисту від cross-org data leak:

### Shar 1 — Column + constraint

Кожна таблиця (крім `organizations` самої): `organization_id uuid not null references organizations(id) on delete cascade`.

FK + cascade = delete org → delete все. Тестується у integration test `supabase.from('organizations').delete().eq('id', test_org)` → перевірити що children rows reset до 0.

### Shar 2 — RLS policy

Helper function:

```sql
create or replace function public.get_user_org_id() returns uuid
language sql security definer stable as $$
  select organization_id from public.users where id = auth.uid()
$$;
```

Policy на кожній таблиці:

```sql
alter table {t} enable row level security;
create policy "{t}_org_isolation" on {t}
  for all using (organization_id = public.get_user_org_id());
```

### Shar 3 — Public demo exception

Для hackathon demo brand (UUID в ENV `DEMO_BRAND_ID`, seed'иться у `supabase/seed.sql`):

```sql
create policy "{t}_public_demo" on {t}
  for select using (organization_id = current_setting('app.demo_brand_id')::uuid);
```

`current_setting('app.demo_brand_id')` виставляється SQL session variable на server side при запиті з `/demo/*` або `/widget/*` routes. Anon client без session — отримує тільки public demo data.

**Never** пиши SQL що обходить RLS. `service_role` key використовується тільки у Inngest functions для INSERT (вони trust'аться по architecture — trigger'яться з наших власних events).

---

## 7. Service layer (Peec snapshot loader + live MCP/REST wrappers)

Usage `lib/services/{name}.ts` — тонкі обгортки з доданою cost accounting + retry policy. Peec — окремо як snapshot file loader (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`); інші сервіси (Tavily, Slack, OpenAI, Anthropic) — live HTTP/SDK calls.

**Peec snapshot loader** (`lib/services/peec-snapshot.ts`):

```ts
import "server-only";
import { readFile } from "node:fs/promises";
import { PeecSnapshotFileSchema } from "@/lib/schemas/peec-snapshot";

export async function loadPeecSnapshot() {
  const raw = await readFile(process.env.PEEC_SNAPSHOT_PATH!, "utf-8");
  return PeecSnapshotFileSchema.parse(JSON.parse(raw));
}
// + getLatestBrandReport, getBrandReportHistory, getChatsForBrand, getActions getters
```

**Live API wrappers** (Tavily приклад):

```ts
// lib/services/tavily.ts
export async function tavilySearch(args: TavilySearchArgs) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, ...args }),
  });
  await recordCost({ service: "tavily", operation: "search", usd_cents: 1, organization_id: args.organization_id });
  return TavilySearchResponseSchema.parse(await response.json());
}
```

Всі calls — server-side. Client bundle не має access до API keys (enforced через Next.js `server-only` package).

---

## 8. Evidence chain

Інваріант: **жодний user-facing артефакт без evidence_refs**. Chain для типового counter-draft:

```
Firecrawl scrape (URL + timestamp)
  → signals row INSERT (evidence_refs = [source_url])
  → signal embedding → dedup check pass
  → severity=high classified
  → counter_drafts row INSERT (evidence_refs = [signal.id + signal.source_url])
  → UI render: "Based on [competitor announced X at (url)]"
```

Zod enforce: `evidence_refs: z.array(z.string().url().or(z.string().uuid())).min(1)`.

UI rendering: кожна counter-draft card має clickable "Джерело:" footer з URL/timestamp. Якщо evidence_refs пуста при render — throw error, не hide silently.

---

## 9. Deployment topology

### Vercel

- **Project:** `bbh` (прив'язаний до GitHub repo `git@github.com:glib/bbh.git`).
- **Region:** `fra1` (Frankfurt) — close to Supabase eu-west-1.
- **Domains:** `bbh-brown.vercel.app` (default), custom domain post-demo.
- **Env vars (hackathon-active):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `SLACK_WEBHOOK_URL`, `PEEC_SNAPSHOT_PATH=./data/peec-snapshot.json`, `DEMO_BRAND_ID=00000000-0000-0000-0000-00000000a771` (Attio), `DEMO_BRAND_SLUG=attio`. **No `PEEC_API_KEY`** — Peec accessed via committed snapshot file, не live REST (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`). **Deferred env vars** (post-hackathon): `FIRECRAWL_API_KEY`, `TELLI_API_KEY`, `TELLI_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY`. Усі secret keys у Vercel dashboard, не у git.
- **Build:** `pnpm install --frozen-lockfile && pnpm build`.
- **Preview deploys:** на кожен PR, `*.vercel.app` URL для manual QA.

### Supabase

- **Project:** `bbh-prod` (eu-west-1).
- **Extensions enabled:** `vector`, `pg_cron` (на випадок якщо треба backup scheduling), `pgcrypto`.
- **Migrations:** `supabase/migrations/*.sql`, applied через `supabase db push` перед merge на main.
- **Seed:** `supabase/seed.sql` — demo brand + 7 days data, re-runnable для wipe-and-reset.
- **Backups:** Supabase robить daily на Pro tier. Hackathon на free — critical state (seed) committed у git.

### Inngest

- **App:** `bbh`, connected до Vercel deployment URL.
- **Endpoint:** `/api/inngest` auto-registers functions при deploy.
- **Env:** `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` у Vercel.
- **Local dev:** `pnpm dlx inngest-cli@latest dev` — runs local dashboard на `localhost:8288`.

---

## 10. Self-monitoring — crisis comms через ту саму machinery

Marketer round-2 surfaced gap: BBH original design assumes "monitor THEM" (competitors). Real CMO pain — also "monitor US" (data breach, layoffs, pricing backlash, security incident у LLM responses).

**Solution — additive, no new pipeline:**

1. `competitors` table має `relationship` enum: `self` | `competitor`.
2. Demo brand (наприклад Attio для current hackathon, або генерично будь-який customer brand) має 1+ row з `relationship='self'` + handles + search_terms що describes власний brand.
3. W9 radar iterates через ALL active competitors regardless of relationship. Self brand scanned same way as competitor brands.
4. Severity classification у LLM prompt враховує relationship — high severity для self-brand = crisis (e.g. "Attio data breach reported"); high severity для competitor = strategic move (e.g. "HubSpot launched new feature").
5. Counter-draft generation для self-high — це response/clarification post (e.g. "Address the breach narrative head-on"), не competitive counter.
6. Dashboard signal feed differentiates через `competitor.relationship` badge + severity color.

**Hackathon coverage (revised 2026-04-25):** Demo brand тепер Attio (не AcmeCloud / не BBH self) per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`. Self-monitoring demo angle **відкладений** для post-hackathon — Attio scenario не має storyline для own-brand crisis comms. Schema (`competitors.relationship='self'`) preserved для post-hackathon reactivation з real customers. Якщо журі питає "what about your own brand crisis?" — відповідь та сама: "Same machinery generalizes — `competitors.relationship` enum включає 'self', сьогодні не demonstrate'имо це бо demo brand-fit це не вимагає."

**Post-hackathon:** dedicated UI section "Self-monitoring" з alert-style cards для self-high signals + integration з PR layer (Cision/Meltwater) для real journalist mention tracking.

---

## 11. Cross-references

- **Зміни у цьому файлі** → перевір `CLAUDE.md §22` (Reference Docs), `decisions/README.md`.
- **Hackathon scope cut** → `decisions/2026-04-25-hackathon-scope-cut.md`.
- **Marketer feedback що drove cuts** → `feedback/marketer-2026-04-25.md`.
- **Zod schemas точні shape'и** → `CONTRACTS.md`.
- **Per-pipeline deep dive** (W4/W5/W6/W9) → `PIPELINES.md`.
- **Feature requirements** → `features/onboarding.md`, `features/dashboard.md`, `features/morning-brief.md`, `features/content-expansion.md`.
- **Deploy operations** → `RUNBOOK.md`.
- **CLI commands** → `CLI-TOOLS.md`.
- **Відомі gaps** → `GAPS.md`.
- **Historical (plugin-era)** → `_archive/ARCHITECTURE.md` (не читати для "зараз", тільки для "чому не так").
