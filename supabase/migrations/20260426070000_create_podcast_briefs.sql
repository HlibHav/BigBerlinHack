-- W11 podcast-prep — store retrieval-optimized podcast briefs.
-- Per brand-intel/features/podcast-prep.md §6.1 + decisions/2026-04-26-w11-podcast-prep.md.
--
-- Founder fills metadata form (podcast name, host, audience, episode topic,
-- optional previous episode URLs). Pipeline generates brief w/ talking points,
-- anticipated Q&A, brand-drop moments, topics to avoid, competitor mention
-- strategy, plus judge verdict on 4 dimensions. All structured sections live
-- in jsonb columns; markdown_brief holds the SSR-ready Markdown render.

create table podcast_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  -- Founder-supplied metadata (form inputs)
  podcast_name text not null,
  host_name text not null,
  audience text not null,
  episode_topic text not null,
  previous_episode_urls jsonb not null default '[]'::jsonb,
  scheduled_date date,

  -- LLM-generated structured sections (Zod-validated before insert)
  talking_points jsonb not null default '[]'::jsonb,
  anticipated_qa jsonb not null default '[]'::jsonb,
  brand_drop_moments jsonb not null default '[]'::jsonb,
  topics_to_avoid jsonb not null default '[]'::jsonb,
  competitor_mention_strategy jsonb not null default '[]'::jsonb,

  -- Judge verdict (claude-sonnet-4-5 single call rates whole brief)
  judge_score smallint check (judge_score is null or (judge_score >= 1 and judge_score <= 10)),
  judge_reasoning text,
  judge_dimensions jsonb,
  top_fixes jsonb not null default '[]'::jsonb,

  -- Pre-rendered Markdown for SSR / mobile detail page / download
  markdown_brief text not null default '',

  -- Audit trail
  simulator_run_id uuid references runs(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

alter table podcast_briefs enable row level security;

create policy "podcast_briefs_org_isolation" on podcast_briefs
  for all using (organization_id = public.get_user_org_id());

create policy "podcast_briefs_public_demo" on podcast_briefs
  for select using (organization_id = nullif(current_setting('app.demo_brand_id', true), '')::uuid);

create index podcast_briefs_org_created_idx on podcast_briefs(organization_id, created_at desc);

create index podcast_briefs_run_idx on podcast_briefs(simulator_run_id)
  where simulator_run_id is not null;

create index podcast_briefs_scheduled_idx on podcast_briefs(scheduled_date)
  where scheduled_date is not null;

comment on table podcast_briefs is
  'W11 podcast-prep output. Per brand-intel/features/podcast-prep.md.';
