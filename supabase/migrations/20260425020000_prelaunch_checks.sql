-- W5 Pre-Launch Check — окрема фіча, окрема таблиця для history per brand.
-- Trigger: user submits draft phrasing на /demo/[brand]?tab=prelaunch.
-- Pipeline: Peec baseline → Tavily phrase availability + news → LLM panel
-- scoring → Claude verdict synthesis → persist row → Realtime refresh.

create type prelaunch_verdict as enum ('clear', 'caution', 'clash');

create table prelaunch_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_slug text not null,
  draft_phrasing text not null check (length(draft_phrasing) between 10 and 2000),
  category_hint text,
  verdict prelaunch_verdict not null,
  verdict_reasoning text not null check (length(verdict_reasoning) >= 10),
  baseline jsonb not null,                       -- { visibility, position, sentiment }
  phrase_availability jsonb not null,            -- { taken, by:[brands], evidence_urls:[] }
  llm_panel_results jsonb not null,              -- per-prompt { prompt, mention_rate, avg_position, sentiment }
  cost_usd_cents integer not null default 0,
  evidence_refs text[] not null default '{}'::text[],
  run_id uuid,                                   -- FK to runs (post-hackathon)
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index prelaunch_checks_org_created_idx
  on prelaunch_checks (organization_id, created_at desc);

-- RLS — match existing org_isolation + public_demo pattern
alter table prelaunch_checks enable row level security;

create policy "prelaunch_checks_org_isolation" on prelaunch_checks
  for all using (organization_id = public.get_user_org_id());

create policy "prelaunch_checks_public_demo" on prelaunch_checks
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);
