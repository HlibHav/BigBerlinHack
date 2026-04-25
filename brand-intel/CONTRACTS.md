# Contracts

> Точні shape'и для усіх boundary'ів: Inngest events, LLM structured output, Postgres DDL, HTTP routes, webhook payloads, MCP calls. Це CRITICAL zone — зміни тут тягнуть за собою consuming code. Кожна зміна — через migration + type regen + Zod schema update + test update.

**Version:** 2026-04-25 rev2 (Peec MCP-only + Attio demo brand: §6.1 reшritten as snapshot-file shape; demo brand UUID/slug = Attio). Precedence: цей файл виграє над `knowledge/*` при конфлікті; онови `knowledge/` якщо суперечить. Hackathon scope — `decisions/2026-04-25-hackathon-scope-cut.md` + `decisions/2026-04-25-peec-overlay-pivot.md` (overlay vision + 5 pipelines authoritative; REST API + demo brand sections superseded by `decisions/2026-04-25-mcp-only-peec-attio-demo.md`).

---

## 0. Conventions

- Усі Zod schemas у `lib/schemas/` або `lib/events.ts`. Одне місце — одна schema. Ніяких inline `z.object(...)` у route handlers або Inngest functions.
- DB schema живе у `supabase/migrations/*.sql`. TS types — генеровані: `supabase gen types typescript --linked > lib/supabase/types.ts`.
- Кожна Zod schema з зовнішнім I/O має ≥1 success test + ≥1 failure test у `tests/schemas/*.test.ts`.
- `evidence_refs: z.array(z.string()).min(1)` — інваріант на всіх agent output schemas.
- **Peec data — local snapshot file `data/peec-snapshot.json` (committed у git, не secret). Refresh через Claude Code session, NOT live REST API.** Server-side code reads JSON через `lib/services/peec-snapshot.ts` loader, parses через `PeecSnapshotFileSchema` (див. §6.1).

---

## 1. Inngest event contracts

Джерело істини — `lib/events.ts`. Замислено як union який Inngest client приймає.

```ts
// lib/events.ts
import { z } from "zod";

// ACTIVE — W6′ Slack morning brief (uses MorningBriefTick з call_preference="markdown" path).
// Hackathon path: Slack send via webhook (per features/morning-brief.md).
// Voice path (telli/tts/elevenlabs) — [DEFERRED post-hackathon].
export const MorningBriefTick = z.object({
  organization_id: z.string().uuid(),
  run_window_start: z.string().datetime(),
  call_preference: z.enum(["voice-agent", "tts", "markdown"]),
});
export type MorningBriefTick = z.infer<typeof MorningBriefTick>;

// ACTIVE — W9 competitor radar.
export const CompetitorRadarTick = z.object({
  organization_id: z.string().uuid(),
  sweep_window_hours: z.number().int().positive().default(6),
  sources_override: z.array(z.string().url()).optional(),
});
export type CompetitorRadarTick = z.infer<typeof CompetitorRadarTick>;

// ACTIVE — W5 narrative simulator.
export const NarrativeSimulateRequest = z.object({
  organization_id: z.string().uuid(),
  seed_type: z.enum(["competitor-move", "user-prompt"]),
  seed_payload: z.record(z.unknown()),
  requested_by: z.string().uuid().nullable(),
  num_variants: z.number().int().min(1).max(5).default(3),
});
export type NarrativeSimulateRequest = z.infer<typeof NarrativeSimulateRequest>;

// [DEFERRED — W4 widget cut by hackathon scope, schema preserved for post-hackathon]
export const WidgetRegenerate = z.object({
  organization_id: z.string().uuid(),
  reason: z.enum(["new-snapshot", "manual", "schedule"]),
});
export type WidgetRegenerate = z.infer<typeof WidgetRegenerate>;

// [DEFERRED — W6 voice path cut, schema preserved for post-hackathon Telli reactivation]
export const MorningBriefDelivered = z.object({
  organization_id: z.string().uuid(),
  run_id: z.string().uuid(),
  provider: z.enum(["telli", "elevenlabs", "markdown"]),
  outcome: z.enum(["answered", "voicemail", "failed"]),
  duration_seconds: z.number().int().nullable(),
});
export type MorningBriefDelivered = z.infer<typeof MorningBriefDelivered>;

export const events = {
  "morning-brief.tick": MorningBriefTick,
  "morning-brief.delivered": MorningBriefDelivered,
  "competitor-radar.tick": CompetitorRadarTick,
  "narrative.simulate-request": NarrativeSimulateRequest,
  "widget.regenerate": WidgetRegenerate,
} as const;
```

**Inngest client (`inngest/client.ts`):**

```ts
import { EventSchemas, Inngest } from "inngest";
import { events } from "@/lib/events";

export const inngest = new Inngest({
  id: "bbh",
  schemas: new EventSchemas().fromZod(events),
});
```

Dispatching:

```ts
await inngest.send({
  name: "morning-brief.tick",
  data: { organization_id, run_window_start, call_preference: "voice-agent" },
});
```

Schema enforced at compile-time (TS) + runtime (Inngest parses).

---

## 2. LLM output schemas

Усі structured LLM calls використовують Vercel AI SDK `generateObject({ schema })` або equivalent. `schema` — одна з `lib/schemas/*.ts`.

### 2.1 Snapshot (W4 narrative raw input)

```ts
// lib/schemas/snapshot.ts
export const SnapshotSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  response_text: z.string().min(1),
  citations: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
    excerpt: z.string().max(500),
  })).min(1),
});
```

### 2.2 Signal (W9 competitor move)

```ts
// lib/schemas/signal.ts
export const SignalSchema = z.object({
  source_type: z.enum(["competitor", "internal", "external", "peec_delta"]),  // peec_delta = signal derived from data/peec-snapshot.json delta detection
  source_url: z.string().url(),
  severity: z.enum(["low", "med", "high"]),
  sentiment: z.enum(["positive", "neutral", "negative"]),  // як сигнал виглядає для brand audience
  summary: z.string().min(20).max(500),
  reasoning: z.string().min(20),               // why цей severity + sentiment
  evidence_refs: z.array(z.string().url()).min(1),
});
```

**Severity vs sentiment** — different axes. Severity = "how big a deal це для brand?" (impact). Sentiment = "як це звучить для audience?" (positive/neutral/negative tone of the underlying narrative). Examples:
- HubSpot launches new feature → severity=high, sentiment=neutral (competitive threat, not negative-toned).
- Tweet "Attio security issue" → severity=high, sentiment=negative (crisis content).
- Industry trend article mentioning category leaders including us → severity=low, sentiment=positive (passive validation).

Both classified у same LLM call (no added cost vs severity-only).

### 2.3 Counter-draft (W9 auto-generated reaction)

```ts
// lib/schemas/counter-draft.ts
export const CounterDraftSchema = z.object({
  body: z.string().min(50).max(2000),
  channel_hint: z.enum(["x", "linkedin", "blog", "multi"]),
  tone_pillar: z.string().min(1),              // з brand tone pillars
  reasoning: z.string().min(20),               // чому цей tone/channel
  evidence_refs: z.array(z.string()).min(1),   // signal.id (uuid) + source_url
});
```

**Severity threshold rule** (per `decisions/2026-04-24-counter-draft-severity-high-only.md` + `decisions/2026-04-25-hackathon-scope-cut.md`): auto-generation тільки для `signals.severity = 'high'`. Medium signals — on-demand button у dashboard. Low — visible only.

### 2.4 Narrative (W4 public widget content) `[DEFERRED — W4 widget cut, schema preserved for post-hackathon]`

```ts
// lib/schemas/narrative.ts
export const NarrativeSchema = z.object({
  summary_markdown: z.string().min(100).max(3000),
  highlighted_themes: z.array(z.string().min(3)).min(1).max(5),
  citation_ids: z.array(z.string().uuid()).min(1),
});
```

### 2.5 Narrative variant (W5 simulator output)

```ts
// lib/schemas/narrative-variant.ts
export const NarrativeVariantSchema = z.object({
  rank: z.number().int().min(1).max(5),
  body: z.string().min(50).max(1500),
  score: z.number().min(0).max(1),
  score_reasoning: z.string().min(20),
  predicted_sentiment: z.enum(["positive", "neutral", "negative"]),  // sentiment of the variant text itself — для brand-voice safety check
  avg_position: z.number().min(1).nullable(),  // average rank when LLM lists multiple brands; null якщо brand не з'явився у any test prompt
  mention_rate: z.number().min(0).max(1),      // fraction of test prompts де brand mentioned
  evidence_refs: z.array(z.string()).min(1),
});

export const SimulatorOutputSchema = z.object({
  variants: z.array(NarrativeVariantSchema).min(1).max(5),
  seed_echo: z.string(),                       // repeat back what was simulated
});
```

**Score formula** (W5 simulator): `score = mention_rate × (1 / avg_position)` нормалізовано [0, 1]. Variant з 80% mention rate і avg position 1.5 → score ≈ 0.53. Variant з 50% mention rate і position 3.2 → score ≈ 0.16. Якщо `avg_position = null` (brand never mentioned) → score = 0.

**Predicted sentiment** — brand-voice safety check. Brand з "calm/confident" tone не повинен видавати "defensive/anxious" counter-drafts. Якщо predicted_sentiment != organization.brand_sentiment_target — flag у UI як warning (post-hackathon добавляємо `organizations.brand_sentiment_target`; для hackathon просто display).

Persisted у `narrative_variants` table (див. §3.3) з `simulator_run_id` group key.

### 2.6 Content variant (W7 multi-channel expansion)

```ts
// lib/schemas/content-variant.ts
export const ContentVariantSchema = z.object({
  channel: z.enum(["blog", "x_thread", "linkedin", "email"]),
  title: z.string().min(5).max(120).nullable(),       // null for x_thread/linkedin/email
  body: z.string().min(50),                            // main content; for email = email body
  metadata: z.record(z.unknown()).default({}),         // channel-specific:
                                                        //   blog: {meta_description, slug_suggestion}
                                                        //   x_thread: {tweets: string[]}  // each ≤280 chars
                                                        //   linkedin: {hashtags: string[]}
                                                        //   email: {subject, preheader}
  evidence_refs: z.array(z.string()).min(1),
});

export const ContentExpansionOutputSchema = z.object({
  parent_counter_draft_id: z.string().uuid(),
  variants: z.array(ContentVariantSchema).length(4),  // exactly 4: blog + x_thread + linkedin + email
});
```

X thread tweets validated кожен ≤280 chars через Zod refine on metadata.tweets array.

### 2.10 Morning brief (W6′ Slack delivery)

```ts
// lib/schemas/morning-brief.ts
export const MorningBriefSchema = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),    // YYYY-MM-DD
  summary_body: z.string().min(50).max(2000),                 // markdown-formatted, Slack-flavored
  signal_count: z.number().int().nonnegative(),
  severity_breakdown: z.object({
    high: z.number().int().nonnegative(),
    med: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  drafts_pending: z.number().int().nonnegative(),
  brand_pulse: z.object({
    visibility_pct: z.number().nullable(),
    avg_position: z.number().nullable(),
    sentiment_mix: z.object({
      positive_pct: z.number(),
      neutral_pct: z.number(),
      negative_pct: z.number(),
    }).nullable(),
  }).nullable(),                                              // null якщо no Peec data yet
  evidence_refs: z.array(z.string()).min(1),
});
```

### 2.7 Competitor (onboarding + W9 input list)

```ts
// lib/schemas/competitor.ts
export const CompetitorSchema = z.object({
  display_name: z.string().min(1).max(120),
  relationship: z.enum(["self", "competitor"]),
  homepage_url: z.string().url().nullable(),
  handles: z.record(z.string()).default({}),    // {twitter, linkedin, github, ...}
  search_terms: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
});
```

W9 reads через `select * from competitors where organization_id = X and is_active = true` як scrape list. `relationship='self'` enables crisis-comms / self-monitoring через ту саму machinery.

### 2.8 Run stats (W9/W5 aggregated audit)

```ts
// lib/schemas/run-stats.ts
export const RadarRunStatsSchema = z.object({
  function_name: z.literal("competitor-radar"),
  started_at: z.string().datetime(),
  duration_seconds: z.number().int().nonnegative(),
  sources_scanned: z.number().int().nonnegative(),
  signals_total: z.number().int().nonnegative(),
  signals_by_severity: z.object({
    high: z.number().int().nonnegative().default(0),
    med: z.number().int().nonnegative().default(0),
    low: z.number().int().nonnegative().default(0),
  }),
  drafts_generated: z.number().int().nonnegative(),
  cost_usd_cents: z.number().int().nonnegative(),
});

export const SimulatorRunStatsSchema = z.object({
  function_name: z.literal("narrative-simulator"),
  started_at: z.string().datetime(),
  duration_seconds: z.number().int().nonnegative(),
  variants_generated: z.number().int().min(1).max(5),
  prompts_per_variant: z.number().int(),
  models_used: z.array(z.string()),
  cost_usd_cents: z.number().int().nonnegative(),
});

export const RunStatsSchema = z.discriminatedUnion("function_name", [
  RadarRunStatsSchema,
  SimulatorRunStatsSchema,
]);
```

Стore'иться у `runs.stats jsonb`. Dashboard audit panel reads це для top-of-page summary + cost badge.

<!-- §2.6 Morning brief text — REMOVED 2026-04-25 (was stale duplicate of §2.10 MorningBriefSchema). Use §2.10 (Slack-flavored з brand_pulse). Section number 2.6 reused by ContentVariantSchema above; no renumbering to preserve cross-refs. -->


---

## 3. Database schema (Postgres DDL)

Нижче — mental model DDL. Точний migration — `supabase/migrations/0000_init.sql` (перший INIT). Подальші alter'и — окремі migration файли, named `YYYYMMDDHHMMSS_{topic}.sql`.

### 3.1 Extensions

```sql
create extension if not exists "vector";
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";  -- reserved для post-demo
```

### 3.2 Enums

```sql
create type severity_level as enum ('low', 'med', 'high');
create type sentiment_label as enum ('positive', 'neutral', 'negative');
create type content_channel as enum ('blog', 'x_thread', 'linkedin', 'email');
create type content_status as enum ('generated', 'edited', 'sent', 'archived');
create type brief_channel as enum ('slack', 'email');
create type brief_status as enum ('queued', 'sent', 'failed');
create type voice_preference as enum ('voice-agent', 'tts', 'markdown');
create type signal_source_type as enum ('competitor', 'internal', 'external', 'peec_delta');  -- peec_delta added per decisions/2026-04-25-peec-overlay-pivot.md (§"Schema additions") for Peec snapshot-derived signals
create type counter_draft_status as enum ('draft', 'approved', 'rejected', 'published');
create type counter_draft_channel as enum ('x', 'linkedin', 'blog', 'multi');
create type cost_service as enum ('openai', 'anthropic', 'peec', 'tavily', 'firecrawl', 'telli', 'elevenlabs');
create type voice_provider as enum ('telli', 'elevenlabs', 'markdown');
create type voice_outcome as enum ('answered', 'voicemail', 'failed');
```

### 3.3 Tables

```sql
-- organizations (root)
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  local_timezone text not null default 'UTC',
  voice_call_preference voice_preference not null default 'markdown',
  is_public_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- users (mirror Supabase auth.users, with organization_id)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- competitors (W9 scrape list + onboarding source)
-- relationship='self' enables crisis-comms self-monitoring via same machinery
create table competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  display_name text not null,
  relationship text not null check (relationship in ('self', 'competitor')) default 'competitor',
  homepage_url text,
  handles jsonb not null default '{}'::jsonb,
  search_terms text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index competitors_org_active_idx on competitors(organization_id, is_active);

-- snapshots
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  captured_at timestamptz not null default now(),
  prompt text not null,
  model text not null,
  response_text text not null,
  embedding vector(1536),
  source_mcp text not null,
  created_at timestamptz not null default now()
);
create index snapshots_org_captured_idx on snapshots(organization_id, captured_at desc);
create index snapshots_embedding_ivfflat on snapshots using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- citations
create table citations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  url text not null,
  title text not null,
  excerpt text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index citations_snapshot_idx on citations(snapshot_id);

-- signal_source_type extended: peec_delta added для Peec-sourced signals
-- create type signal_source_type as enum ('competitor', 'internal', 'external', 'peec_delta');

-- signals
create table signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid references competitors(id) on delete set null,
  source_type signal_source_type not null,                     -- 'peec_delta' = Peec MCP-sourced; 'competitor'/'internal'/'external' = Tavily-sourced
  source_url text not null,
  severity severity_level not null,
  sentiment sentiment_label not null,                          -- з Peec natively (peec_delta) або own LLM classifier (Tavily-sourced)
  position numeric(4, 2),                                      -- avg LLM list rank (Peec-only); null для Tavily-sourced
  summary text not null,
  reasoning text not null,
  evidence_refs text[] not null check (array_length(evidence_refs, 1) >= 1),
  embedding vector(1536),
  auto_draft boolean not null default false,                   -- true тільки коли severity='high'
  run_id uuid,                                                  -- backfill після runs INSERT (FK додаємо post-hackathon)
  created_at timestamptz not null default now()
);
create index signals_org_severity_idx on signals(organization_id, severity, created_at desc);
create index signals_org_sentiment_idx on signals(organization_id, sentiment, created_at desc);
create index signals_embedding_ivfflat on signals using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- counter_drafts
create table counter_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  signal_id uuid references signals(id) on delete set null,
  status counter_draft_status not null default 'draft',
  body text not null,
  channel_hint counter_draft_channel not null,
  tone_pillar text not null,
  reasoning text not null,
  evidence_refs text[] not null check (array_length(evidence_refs, 1) >= 1),
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index counter_drafts_org_status_idx on counter_drafts(organization_id, status, created_at desc);

-- narratives
create table narratives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  generated_at timestamptz not null default now(),
  summary_markdown text not null,
  highlighted_themes text[] not null,
  citation_ids uuid[] not null check (array_length(citation_ids, 1) >= 1),
  is_public boolean not null default false,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index narratives_org_generated_idx on narratives(organization_id, generated_at desc);

-- runs (audit log)
create table runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  function_name text not null,
  event_payload jsonb not null,
  ok boolean not null,
  reason text,
  stats jsonb,                                                -- RunStatsSchema (див. §2.8) — sources_scanned, signals_by_severity, drafts_generated, cost_usd_cents
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index runs_org_func_idx on runs(organization_id, function_name, created_at desc);
create index runs_org_finished_idx on runs(organization_id, finished_at desc) where finished_at is not null;

-- cost_ledger
create table cost_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service cost_service not null,
  operation text not null,
  tokens_or_units integer,
  usd_cents integer not null,
  run_id uuid references runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index cost_ledger_org_service_idx on cost_ledger(organization_id, service, created_at desc);

-- content_variants (W7 multi-channel expansion output)
create table content_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_counter_draft_id uuid not null references counter_drafts(id) on delete cascade,
  channel content_channel not null,
  title text,                                                  -- null для x_thread/linkedin/email
  body text not null,
  metadata jsonb not null default '{}'::jsonb,                 -- channel-specific shape
  status content_status not null default 'generated',
  evidence_refs text[] not null check (array_length(evidence_refs, 1) >= 1),
  run_id uuid,                                                  -- W7 run id (FK post-hackathon)
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index content_variants_parent_idx on content_variants(parent_counter_draft_id);
create unique index content_variants_parent_channel_uniq on content_variants(parent_counter_draft_id, channel);

-- brief_deliveries (W6′ Slack/email send tracking)
create table brief_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  delivery_date date not null,                                  -- target day
  channel brief_channel not null default 'slack',
  recipient text not null,                                      -- Slack channel id або email address
  status brief_status not null default 'queued',
  summary_body text not null,                                   -- full brief markdown
  sent_at timestamptz,
  error_reason text,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index brief_deliveries_org_date_idx on brief_deliveries(organization_id, delivery_date desc);

-- narrative_variants (W5 simulator output, persisted per run)
create table narrative_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  simulator_run_id uuid not null references runs(id) on delete cascade,
  seed_signal_id uuid references signals(id) on delete set null,
  seed_counter_draft_id uuid references counter_drafts(id) on delete set null,
  rank integer not null check (rank between 1 and 5),
  body text not null,
  score numeric(4, 3) not null check (score between 0 and 1),
  score_reasoning text not null,
  predicted_sentiment sentiment_label not null,                          -- sentiment of the variant text itself (brand-voice safety check)
  avg_position numeric(4, 2) check (avg_position is null or avg_position > 0),   -- avg rank coли LLM lists brands; null = never mentioned
  mention_rate numeric(4, 3) not null check (mention_rate between 0 and 1),      -- fraction of test prompts where brand mentioned
  evidence_refs text[] not null check (array_length(evidence_refs, 1) >= 1),
  created_at timestamptz not null default now()
);
create index narrative_variants_org_run_idx on narrative_variants(organization_id, simulator_run_id, rank);

-- voice_call_results — DEFERRED post-hackathon per ADR 2026-04-25-hackathon-scope-cut
-- Schema preserved for future reactivation; not created у 0000_init.sql.
create table voice_call_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null references runs(id) on delete cascade,
  provider voice_provider not null,
  call_id text not null,
  duration_seconds integer,
  transcript text,
  audio_storage_path text,
  outcome voice_outcome not null,
  created_at timestamptz not null default now()
);
create index voice_results_run_idx on voice_call_results(run_id);
```

**Hackathon migration cut** (per `decisions/2026-04-25-hackathon-scope-cut.md`): `voice_call_results` створюється тільки якщо post-hackathon W6 reactivated. Для demo migration `0000_init.sql` створює усі таблиці окрім `voice_call_results`. Якщо post-hackathon reactivate — окрема migration `YYYYMMDD_voice_call_results.sql`.

### 3.4 RLS helpers + policies

```sql
-- helper
create or replace function public.get_user_org_id()
returns uuid
language sql security definer stable
as $$
  select organization_id from public.users where id = auth.uid()
$$;

-- per-table pattern
alter table snapshots enable row level security;
create policy "snapshots_org_isolation" on snapshots
  for all using (organization_id = public.get_user_org_id());
create policy "snapshots_public_demo" on snapshots
  for select using (
    organization_id = (current_setting('app.demo_brand_id', true))::uuid
  );
```

Apply same двома policies pattern до: `citations`, `signals`, `counter_drafts`, `narratives`, `runs`, `cost_ledger`, `competitors`, `narrative_variants`, `content_variants`, `brief_deliveries`. `voice_call_results` `[DEFERRED]` — RLS pair додається коли W6 voice reactivated. `organizations` має тільки `_public_demo` (read) + owner write (via service role).

### 3.5 Storage buckets

```sql
-- Hackathon-active buckets (created у migration 0000_init):
insert into storage.buckets (id, name, public) values
  ('counter-drafts', 'counter-drafts', false),
  ('snapshots-raw', 'snapshots-raw', false);

-- [DEFERRED — created по reactivation of W6 voice]
-- ('voice-recordings', 'voice-recordings', false);

-- bucket RLS (на storage.objects)
create policy "org_isolation_drafts" on storage.objects
  for all using (
    bucket_id = 'counter-drafts'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
  );
-- same pattern для `snapshots-raw` (і `voice-recordings` коли deferred → active)
```

Path convention: `{bucket}/{organization_id}/{filename}`. `storage.foldername(name)[1]` — перший segment path.

---

## 4. API routes

### 4.1 Route handlers (`app/api/*`)

| Path | Method | Purpose | Body schema | Response | Status |
|------|--------|---------|-------------|----------|--------|
| `/api/inngest` | POST | Inngest serve endpoint | Inngest internal | `200 {}` | ACTIVE |
| `/api/webhooks/telli` | POST | Telli call callback | `TelliWebhookSchema` (see §5) | `200 { received: true }` | `[DEFERRED — W6 voice cut]` |
| `/api/webhooks/peec` | POST | Peec push (якщо implemented) | `PeecWebhookSchema` | `200 { received: true }` | `[DEFERRED — Peec is MCP-only via snapshot file]` |
| `/api/healthz` | GET | Liveness | — | `200 { ok: true }` | ACTIVE |
| `/api/readyz` | GET | Readiness (Supabase + Inngest reachable) | — | `200 { supabase: "ok", inngest: "ok" }` | ACTIVE |

### 4.2 Server Actions

Server Actions живуть у `app/actions/*.ts` з `"use server"`. Кожна:
1. Parses input via Zod.
2. Checks `auth.getUser()` → derives `organization_id`.
3. Performs Supabase mutation (RLS enforces).
4. `revalidateTag(...)` or `revalidatePath(...)`.

Приклад:

```ts
// app/actions/counter-draft.ts
"use server";

const ApproveInput = z.object({
  draft_id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export async function reviewCounterDraft(raw: unknown) {
  const input = ApproveInput.parse(raw);
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauth");

  const { error } = await supabase
    .from("counter_drafts")
    .update({
      status: input.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.draft_id);

  if (error) throw error;
  revalidateTag(`drafts:${user.id}`);
  return { ok: true };
}
```

### 4.3 Page routes

| Path | Render | Auth | Purpose |
|------|--------|------|---------|
| `/demo/[brand]` | SSR | none (public demo policy) | Hackathon demo dashboard |
| `/widget/[brand]` | SSR | none | Embeddable iframe |
| `/dashboard/[brand]` | SSR | required | Owner dashboard (post-demo) |
| `/dashboard/[brand]/drafts` | SSR + client form | required | Counter-draft approval |
| `/` | static | none | Landing (post-demo) |

---

## 5. Webhook signatures

### 5.1 Telli `[DEFERRED — W6 voice cut by hackathon scope, schema preserved for post-hackathon reactivation]`

Telli posts callbacks з `X-Telli-Signature: sha256=<hex>` header. Computed as `HMAC-SHA256(body, TELLI_WEBHOOK_SECRET)`.

```ts
// lib/webhooks/telli.ts
export function verifyTelliSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", process.env.TELLI_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  const given = header.slice("sha256=".length);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export const TelliWebhookSchema = z.discriminatedUnion("event_type", [
  z.object({
    event_type: z.literal("call.completed"),
    call_id: z.string(),
    organization_id: z.string().uuid(),
    duration_seconds: z.number().int(),
    transcript: z.string().nullable(),
    audio_url: z.string().url().nullable(),
  }),
  z.object({
    event_type: z.literal("call.failed"),
    call_id: z.string(),
    organization_id: z.string().uuid(),
    reason: z.string(),
  }),
  z.object({
    event_type: z.literal("call.voicemail"),
    call_id: z.string(),
    organization_id: z.string().uuid(),
    duration_seconds: z.number().int(),
  }),
]);
```

Route handler pattern:

```ts
// app/api/webhooks/telli/route.ts
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyTelliSignature(raw, req.headers.get("x-telli-signature"))) {
    return new Response("invalid signature", { status: 401 });
  }
  const payload = TelliWebhookSchema.parse(JSON.parse(raw));
  // ... handle event
  return Response.json({ received: true });
}
```

### 5.2 Peec `[DEFERRED — Peec accessed via MCP snapshot file, no live HTTP webhook surface]`

Per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`, Peec data ingested через manual Claude Code MCP session pull → `data/peec-snapshot.json`. No webhook receiver. Якщо Peec пізніше експонує push webhook (post-hackathon, Enterprise tier): similar HMAC pattern з `PEEC_WEBHOOK_SECRET`. Поки що — pull-only у W9 Inngest function через snapshot loader.

---

## 6. MCP call shapes

Усі MCP calls — server-side only, обгорнуті у `lib/mcp/{service}.ts`.

### 6.1 Peec — snapshot file shape

**Important:** Peec accessed через MCP browser OAuth у Claude Code session (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`), NOT live REST. Server-side code reads `data/peec-snapshot.json` (committed у repo).

`lib/services/peec-snapshot.ts` — JSON loader, не RESToeлієнт:

```ts
// lib/schemas/peec-snapshot.ts
import { z } from "zod";

export const PeecBrandSchema = z.object({
  id: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
  aliases: z.array(z.string()),
  is_own: z.boolean(),
});

export const PeecBrandReportRowSchema = z.object({
  brand_id: z.string(),
  brand_name: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  visibility: z.number().min(0).max(1),                  // 0..1, fraction of LLM responses де brand mentioned
  mention_count: z.number().int().nonnegative(),
  share_of_voice: z.number().min(0).max(1),              // brand share vs all brands у same prompt set
  sentiment: z.enum(["positive", "neutral", "negative"]),
  position: z.number().min(1).max(20).nullable(),        // avg rank коли LLM lists brands; null якщо не з'являється
});

export const PeecChatSchema = z.object({
  id: z.string(),
  prompt_id: z.string(),
  model_id: z.string(),
  date: z.string().datetime(),
  messages: z.array(z.unknown()),                        // raw LLM conversation
  brands_mentioned: z.array(z.string()),
  sources: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
  })),
});

export const PeecUrlReportRowSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  citation_count: z.number().int().nonnegative(),
  retrievals: z.number().int().nonnegative(),
  mentioned_brand_ids: z.array(z.string()),
});

export const PeecActionSchema = z.object({
  text: z.string(),
  group_type: z.enum(["owned", "editorial", "reference", "ugc"]),
  opportunity_score: z.number().min(0).max(1),
});

export const PeecSnapshotFileSchema = z.object({
  captured_at: z.string().datetime(),
  project_id: z.string(),
  brands: z.array(PeecBrandSchema),
  prompts: z.array(z.object({
    id: z.string(),
    text: z.string(),
    country_code: z.string().length(2),
  })),
  brand_reports: z.array(PeecBrandReportRowSchema).min(1),
  chats: z.array(PeecChatSchema),
  url_report: z.array(PeecUrlReportRowSchema),
  actions: z.array(PeecActionSchema),
});

export type PeecSnapshotFile = z.infer<typeof PeecSnapshotFileSchema>;
```

**Loader API** (`lib/services/peec-snapshot.ts`):

```ts
// import "server-only" — JSON file read
export async function loadPeecSnapshot(): Promise<PeecSnapshotFile>;
export function getLatestBrandReport(snapshot: PeecSnapshotFile, brand_name: string): PeecBrandReportRowSchema | null;
export function getBrandReportHistory(snapshot: PeecSnapshotFile, brand_name: string, days: number): PeecBrandReportRowSchema[];
export function getChatsForBrand(snapshot: PeecSnapshotFile, brand_name: string, limit?: number): PeecChatSchema[];
export function getActions(snapshot: PeecSnapshotFile, scope: "owned" | "editorial" | "reference" | "ugc"): PeecActionSchema[];
```

**Refresh workflow** (manual, не cron): Glib opens Claude Code session → команда "refresh peec snapshot" → script `scripts/_peec-pull.ts` re-pull'ить через MCP tools (`mcp__peec__list_projects`, `get_brand_report`, `list_chats`, `get_chat`, `get_url_report`, `get_actions`) → overwrites `data/peec-snapshot.json` → git commit. Documented у `RUNBOOK.md §1.5`.

**Evidence refs convention для Peec-sourced signals:** `["peec-snapshot:{captured_at}", "https://app.peec.ai/projects/{project_id}/brands/{brand_id}"]`. Перший ref — pointer на snapshot moment; другий — Peec dashboard deep link.

### 6.2 Tavily, Firecrawl

Similar pattern: `Args` + `Response` Zod schemas, wrapper function з cost recording.

- **Tavily** `[ACTIVE]`: `tavilySearch({ query, max_results, include_domains? })` → `{ results: { url, title, snippet, score }[] }`.
- **Firecrawl** `[DEFERRED — cut by hackathon scope, Tavily covers]`: `firecrawlScrape({ url, formats: ["markdown"] })` → `{ markdown, metadata: { title, author, published_at? } }`.

Точні shape'и залежать від MCP версій — перевіряй `knowledge/peec-integration/knowledge.md` та аналогічних `knowledge/{provider}-integration/` перед імплементацією.

### 6.3 Telli `[DEFERRED — W6 voice cut, schemas preserved for post-hackathon]`

```ts
export const TelliCallArgs = z.object({
  organization_id: z.string().uuid(),
  to_phone: z.string().regex(/^\+[1-9]\d{7,14}$/),    // E.164
  brief_text: z.string().max(1400),
  voice_id: z.string(),
  callback_url: z.string().url(),                     // /api/webhooks/telli
});

export const TelliCallResponse = z.object({
  call_id: z.string(),
  status: z.enum(["queued", "dialing"]),
});
```

Actual call result delivery — через webhook (див. §5.1), не у response.

### 6.4 ElevenLabs TTS (fallback) `[DEFERRED — W6 voice cut, schemas preserved for post-hackathon]`

```ts
export const ElevenLabsTTSArgs = z.object({
  text: z.string().max(1400),
  voice_id: z.string(),
  model: z.enum(["eleven_turbo_v2", "eleven_multilingual_v2"]),
});

export const ElevenLabsTTSResponse = z.object({
  audio_buffer: z.instanceof(Buffer),                 // upload to Supabase Storage
  duration_seconds: z.number(),
});
```

### 6.5 OpenAI / Anthropic

LLM calls через Vercel AI SDK: `generateObject({ model, schema, prompt })`. Без custom wrapper — AI SDK сам handleає tool calls + structured output. Cost recording окремо у `step.run("log-cost", ...)` після кожного call (читаємо `response.usage` з SDK).

Embedding calls: `openai.embeddings.create({ model: "text-embedding-3-small", input })` через OpenAI SDK direct (AI SDK не exposuє embeddings у v3 API, перевірити у поточній версії).

---

## 7. Cross-cutting invariants

1. **Zod перед INSERT.** Кожна INSERT/UPDATE на Supabase попередня Zod parse'ом. Якщо parse fail — throw у step, не writeай malformed row.
2. **organization_id завжди explicit.** Не покладайся на default. Передавай explicit у кожному mutation.
3. **evidence_refs .min(1) enforced.** Zod schema + Postgres `check (array_length >= 1)` constraint. Пропуск одного — тягне обидва.
4. **No service role у client.** Grep'ни `process.env.SUPABASE_SERVICE_ROLE_KEY` у client bundle build output — має бути 0 hits.
5. **Webhook signature verification before body read.** Якщо signature fail — 401, не парси JSON.
6. **Enum changes need migration.** Додаючи value у enum — `alter type ... add value '...'`, regen types, update Zod schema. Три місця синхронно.

---

## 8. Cross-references

- Pipeline usage цих schemas → `PIPELINES.md`.
- Migration rollout procedure → `RUNBOOK.md#migrations`.
- CLI команди для type regen → `CLI-TOOLS.md#types`.
- Відомі drift failure modes → `GAPS.md`.
- Вищерівнева topology → `ARCHITECTURE.md`.
