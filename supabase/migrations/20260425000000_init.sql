-- BBH initial schema
-- Per brand-intel/CONTRACTS.md §3 + decisions/2026-04-25-{peec-overlay-pivot,mcp-only-peec-attio-demo,hackathon-scope-cut}.md
--
-- Hackathon scope: organizations, users, competitors, snapshots, citations, signals,
-- counter_drafts, narratives, runs, cost_ledger, content_variants, brief_deliveries,
-- narrative_variants. voice_call_results [DEFERRED — W6 voice cut].
--
-- All tables: organization_id NOT NULL + RLS pair (org_isolation + public_demo).
-- Embedding columns nullable (pgvector deferred per scope cut, columns reserved).

-- ============================================================
-- 1. Extensions
-- ============================================================

create extension if not exists "vector";
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- ============================================================
-- 2. Enums
-- ============================================================

create type severity_level as enum ('low', 'med', 'high');
create type sentiment_label as enum ('positive', 'neutral', 'negative');
create type content_channel as enum ('blog', 'x_thread', 'linkedin', 'email');
create type content_status as enum ('generated', 'edited', 'sent', 'archived');
create type brief_channel as enum ('slack', 'email');
create type brief_status as enum ('queued', 'sent', 'failed');
create type voice_preference as enum ('voice-agent', 'tts', 'markdown');
-- peec_delta added per decisions/2026-04-25-peec-overlay-pivot.md (signal derived from data/peec-snapshot.json delta detection)
create type signal_source_type as enum ('competitor', 'internal', 'external', 'peec_delta');
create type counter_draft_status as enum ('draft', 'approved', 'rejected', 'published');
create type counter_draft_channel as enum ('x', 'linkedin', 'blog', 'multi');
-- voice services preserved for forward-compat; not used in hackathon (W6 deferred)
create type cost_service as enum ('openai', 'anthropic', 'peec', 'tavily', 'firecrawl', 'telli', 'elevenlabs');
create type voice_provider as enum ('telli', 'elevenlabs', 'markdown');
create type voice_outcome as enum ('answered', 'voicemail', 'failed');

-- ============================================================
-- 3. Tables
-- ============================================================

-- 3.1 organizations (root)
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

-- 3.2 users (mirror Supabase auth.users with organization_id)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create index users_org_idx on users(organization_id);

-- 3.3 competitors (W9 scrape list + onboarding source; relationship='self' enables self-monitoring)
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

-- 3.4 snapshots (LLM responses captured per brand prompt)
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
-- pgvector index commented for hackathon (no embeddings generated v1); re-enable post-hackathon when embedding fill begins
-- create index snapshots_embedding_ivfflat on snapshots using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 3.5 citations
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

-- 3.6 signals (W9 output: detected competitor/self moves)
create table signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid references competitors(id) on delete set null,
  source_type signal_source_type not null,
  source_url text not null,
  severity severity_level not null,
  sentiment sentiment_label not null,
  position numeric(4, 2),                                      -- avg LLM list rank (Peec-only); null for Tavily-sourced
  summary text not null,
  reasoning text not null,
  evidence_refs text[] not null check (array_length(evidence_refs, 1) >= 1),
  embedding vector(1536),
  auto_draft boolean not null default false,                   -- true only when severity='high'
  run_id uuid,                                                 -- FK to runs added post-hackathon
  created_at timestamptz not null default now()
);
create index signals_org_severity_idx on signals(organization_id, severity, created_at desc);
create index signals_org_sentiment_idx on signals(organization_id, sentiment, created_at desc);
-- pgvector index commented for hackathon
-- create index signals_embedding_ivfflat on signals using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 3.7 counter_drafts (W9 auto-generated reaction posts)
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

-- 3.8 narratives (W4 widget output) [W4 DEFERRED — table preserved for post-hackathon]
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

-- 3.9 runs (audit log for all pipelines)
create table runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  function_name text not null,
  event_payload jsonb not null,
  ok boolean not null,
  reason text,
  stats jsonb,                                                -- RunStatsSchema (CONTRACTS §2.8)
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index runs_org_func_idx on runs(organization_id, function_name, created_at desc);
create index runs_org_finished_idx on runs(organization_id, finished_at desc) where finished_at is not null;

-- 3.10 cost_ledger
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
create index cost_ledger_run_idx on cost_ledger(run_id) where run_id is not null;

-- 3.11 content_variants (W7 multi-channel expansion output)
create table content_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_counter_draft_id uuid not null references counter_drafts(id) on delete cascade,
  channel content_channel not null,
  title text,                                                  -- null for x_thread/linkedin/email
  body text not null,
  metadata jsonb not null default '{}'::jsonb,                 -- channel-specific shape
  status content_status not null default 'generated',
  evidence_refs text[] not null check (array_length(evidence_refs, 1) >= 1),
  run_id uuid,                                                  -- FK to runs added post-hackathon
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index content_variants_parent_idx on content_variants(parent_counter_draft_id);
create unique index content_variants_parent_channel_uniq on content_variants(parent_counter_draft_id, channel);

-- 3.12 brief_deliveries (W6′ Slack send tracking)
create table brief_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  delivery_date date not null,                                  -- target day for the brief
  channel brief_channel not null default 'slack',
  recipient text not null,                                      -- Slack channel id or email address
  status brief_status not null default 'queued',
  summary_body text not null,                                   -- full brief markdown
  sent_at timestamptz,
  error_reason text,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index brief_deliveries_org_date_idx on brief_deliveries(organization_id, delivery_date desc);

-- 3.13 narrative_variants (W5 simulator output, persisted per run)
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
  predicted_sentiment sentiment_label not null,
  avg_position numeric(4, 2) check (avg_position is null or avg_position > 0),
  mention_rate numeric(4, 3) not null check (mention_rate between 0 and 1),
  evidence_refs text[] not null check (array_length(evidence_refs, 1) >= 1),
  created_at timestamptz not null default now()
);
create index narrative_variants_org_run_idx on narrative_variants(organization_id, simulator_run_id, rank);

-- voice_call_results [DEFERRED — W6 voice path cut per decisions/2026-04-25-hackathon-scope-cut.md]
-- DDL preserved у CONTRACTS.md §3.3; not created у цій migration.

-- ============================================================
-- 4. RLS helper + policies
-- ============================================================

create or replace function public.get_user_org_id()
returns uuid
language sql
security definer
stable
as $$
  select organization_id from public.users where id = auth.uid()
$$;

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table users enable row level security;
alter table competitors enable row level security;
alter table snapshots enable row level security;
alter table citations enable row level security;
alter table signals enable row level security;
alter table counter_drafts enable row level security;
alter table narratives enable row level security;
alter table runs enable row level security;
alter table cost_ledger enable row level security;
alter table content_variants enable row level security;
alter table brief_deliveries enable row level security;
alter table narrative_variants enable row level security;

-- organizations: public_demo (read) only; writes via service role
create policy "organizations_public_demo" on organizations
  for select using (id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

-- users: org isolation only (no public demo for users — never anon-readable)
create policy "users_org_isolation" on users
  for all using (organization_id = public.get_user_org_id());

-- Generic pair (org_isolation + public_demo) for the rest

create policy "competitors_org_isolation" on competitors
  for all using (organization_id = public.get_user_org_id());
create policy "competitors_public_demo" on competitors
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "snapshots_org_isolation" on snapshots
  for all using (organization_id = public.get_user_org_id());
create policy "snapshots_public_demo" on snapshots
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "citations_org_isolation" on citations
  for all using (organization_id = public.get_user_org_id());
create policy "citations_public_demo" on citations
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "signals_org_isolation" on signals
  for all using (organization_id = public.get_user_org_id());
create policy "signals_public_demo" on signals
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "counter_drafts_org_isolation" on counter_drafts
  for all using (organization_id = public.get_user_org_id());
create policy "counter_drafts_public_demo" on counter_drafts
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "narratives_org_isolation" on narratives
  for all using (organization_id = public.get_user_org_id());
create policy "narratives_public_demo" on narratives
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "runs_org_isolation" on runs
  for all using (organization_id = public.get_user_org_id());
create policy "runs_public_demo" on runs
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "cost_ledger_org_isolation" on cost_ledger
  for all using (organization_id = public.get_user_org_id());
create policy "cost_ledger_public_demo" on cost_ledger
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "content_variants_org_isolation" on content_variants
  for all using (organization_id = public.get_user_org_id());
create policy "content_variants_public_demo" on content_variants
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "brief_deliveries_org_isolation" on brief_deliveries
  for all using (organization_id = public.get_user_org_id());
create policy "brief_deliveries_public_demo" on brief_deliveries
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create policy "narrative_variants_org_isolation" on narrative_variants
  for all using (organization_id = public.get_user_org_id());
create policy "narrative_variants_public_demo" on narrative_variants
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

-- ============================================================
-- 5. Storage buckets (hackathon-active)
-- ============================================================

insert into storage.buckets (id, name, public) values
  ('counter-drafts', 'counter-drafts', false),
  ('snapshots-raw', 'snapshots-raw', false)
on conflict (id) do nothing;

-- voice-recordings bucket [DEFERRED — created on W6 reactivation]

-- Storage RLS pattern (per-bucket): folder-name first segment === organization_id
create policy "org_isolation_counter_drafts" on storage.objects
  for all using (
    bucket_id = 'counter-drafts'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

create policy "org_isolation_snapshots_raw" on storage.objects
  for all using (
    bucket_id = 'snapshots-raw'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
  );
