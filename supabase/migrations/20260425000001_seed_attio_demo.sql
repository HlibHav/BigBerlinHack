-- BBH seed data — Attio demo brand fixture
-- Re-runnable: idempotent inserts via on conflict do nothing.
-- Per decisions/2026-04-25-mcp-only-peec-attio-demo.md (demo brand = Attio).
-- Peec brand_reports populated via data/peec-snapshot.json (separate, not seeded here).

-- ============================================================
-- 1. Demo organization (Attio)
-- ============================================================

insert into organizations (id, slug, display_name, local_timezone, is_public_demo)
values (
  '00000000-0000-0000-0000-00000000a771'::uuid,
  'attio',
  'Attio',
  'America/New_York',
  true
)
on conflict (id) do nothing;

-- ============================================================
-- 2. Competitors — Attio (self) + Salesforce + HubSpot
-- ============================================================

insert into competitors (id, organization_id, display_name, relationship, homepage_url, handles, search_terms)
values
  (
    '00000001-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    'Attio',
    'self',
    'https://attio.com',
    '{"twitter": "@attio", "linkedin": "/company/attio"}'::jsonb,
    array['Attio', 'Attio CRM', 'modern CRM', 'flexible CRM']
  ),
  (
    '00000002-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    'Salesforce',
    'competitor',
    'https://salesforce.com',
    '{"twitter": "@salesforce", "linkedin": "/company/salesforce"}'::jsonb,
    array['Salesforce', 'Salesforce CRM', 'Sales Cloud', 'Salesforce alternative']
  ),
  (
    '00000003-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    'HubSpot',
    'competitor',
    'https://hubspot.com',
    '{"twitter": "@HubSpot", "linkedin": "/company/hubspot"}'::jsonb,
    array['HubSpot', 'HubSpot CRM', 'HubSpot Sales Hub']
  )
on conflict (id) do nothing;

-- ============================================================
-- 3. Synthetic prior run (W9 radar) для audit panel
-- ============================================================

insert into runs (id, organization_id, function_name, event_payload, ok, stats, started_at, finished_at)
values (
  '10000001-0000-0000-0000-00000000a771'::uuid,
  '00000000-0000-0000-0000-00000000a771'::uuid,
  'competitor-radar',
  '{"organization_id":"00000000-0000-0000-0000-00000000a771","sweep_window_hours":6}'::jsonb,
  true,
  jsonb_build_object(
    'function_name', 'competitor-radar',
    'started_at', (now() - interval '2 hours')::text,
    'duration_seconds', 87,
    'sources_scanned', 5,
    'signals_total', 8,
    'signals_by_severity', jsonb_build_object('high', 1, 'med', 3, 'low', 4),
    'drafts_generated', 1,
    'cost_usd_cents', 6
  ),
  now() - interval '2 hours',
  now() - interval '2 hours' + interval '87 seconds'
)
on conflict (id) do nothing;

-- ============================================================
-- 4. Signals — mix severities, mix Peec/Tavily sources
-- ============================================================

-- HIGH: HubSpot launched AI Sales Agent (competitor strategic move)
insert into signals (id, organization_id, competitor_id, source_type, source_url, severity, sentiment, position, summary, reasoning, evidence_refs, auto_draft, run_id, created_at)
values (
  '20000001-0000-0000-0000-00000000a771'::uuid,
  '00000000-0000-0000-0000-00000000a771'::uuid,
  '00000003-0000-0000-0000-00000000a771'::uuid,
  'competitor',
  'https://hubspot.com/products/breeze-ai-sales-agent',
  'high',
  'neutral',
  null,
  'HubSpot launches Breeze AI Sales Agent — autonomous prospecting + email drafting + CRM auto-update across pipeline stages.',
  'High severity: directly competes with Attio''s AI-native positioning. Neutral sentiment: product launch tone is factual, not negative-toned.',
  array['https://hubspot.com/products/breeze-ai-sales-agent', 'https://techcrunch.com/2026/04/24/hubspot-breeze-ai-launch'],
  true,
  '10000001-0000-0000-0000-00000000a771'::uuid,
  now() - interval '2 hours'
);

-- MED: Salesforce Q1 earnings call mentions "next-gen CRM" pivot
insert into signals (id, organization_id, competitor_id, source_type, source_url, severity, sentiment, position, summary, reasoning, evidence_refs, auto_draft, run_id, created_at)
values
  (
    '20000002-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    '00000002-0000-0000-0000-00000000a771'::uuid,
    'competitor',
    'https://salesforce.com/news/q1-2026-earnings',
    'med',
    'neutral',
    null,
    'Salesforce Q1 earnings: 12% revenue growth, "next-gen CRM" investment focus. CEO mentions "modernizing the CRM stack" 8 times.',
    'Med severity: signals competitive pressure on positioning but no concrete product launch. Neutral sentiment: financial reporting tone.',
    array['https://salesforce.com/news/q1-2026-earnings', 'https://www.bloomberg.com/news/articles/2026-04-24/salesforce-q1'],
    false,
    '10000001-0000-0000-0000-00000000a771'::uuid,
    now() - interval '5 hours'
  ),
  (
    '20000003-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    '00000003-0000-0000-0000-00000000a771'::uuid,
    'peec_delta',
    'https://app.peec.ai/projects/or_d9869f1c-3586-43f1-a994-c63125459aad/brands/hubspot',
    'med',
    'positive',
    2.4,
    'HubSpot visibility on "best CRM for B2B startups" prompt rose from 0.45 → 0.58 (28% delta) over last 7 days. Position improved from 3.2 → 2.4.',
    'Med severity: visibility delta >25% indicates LLM perception shift. Positive sentiment: HubSpot framed favorably in responses.',
    array['peec-snapshot:2026-04-25T08:00Z', 'https://app.peec.ai/projects/or_d9869f1c-3586-43f1-a994-c63125459aad/brands/hubspot'],
    false,
    '10000001-0000-0000-0000-00000000a771'::uuid,
    now() - interval '6 hours'
  ),
  (
    '20000004-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    '00000001-0000-0000-0000-00000000a771'::uuid,
    'peec_delta',
    'https://app.peec.ai/projects/or_d9869f1c-3586-43f1-a994-c63125459aad/brands/attio',
    'med',
    'neutral',
    4.1,
    'Attio visibility on "Salesforce alternatives" steady at 0.32. Position 4.1 (out of 8 brands listed). Sentiment improving (4 positive, 1 neutral).',
    'Med severity: position 4.1 means Attio rarely top-3 in alternatives lists. Action: blog content + comparison pages.',
    array['peec-snapshot:2026-04-25T08:00Z', 'https://app.peec.ai/projects/or_d9869f1c-3586-43f1-a994-c63125459aad/brands/attio'],
    false,
    '10000001-0000-0000-0000-00000000a771'::uuid,
    now() - interval '7 hours'
  );

-- LOW: industry trend articles
insert into signals (id, organization_id, competitor_id, source_type, source_url, severity, sentiment, position, summary, reasoning, evidence_refs, auto_draft, run_id, created_at)
values
  (
    '20000005-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    null,
    'external',
    'https://gartner.com/en/research/crm-magic-quadrant-2026',
    'low',
    'positive',
    null,
    'Gartner Magic Quadrant 2026 mentions Attio under "Visionaries" category alongside 3 other modern CRMs. Salesforce/HubSpot in "Leaders".',
    'Low severity: passive mention, no direct competitive action. Positive: Visionary placement = innovation recognition.',
    array['https://gartner.com/en/research/crm-magic-quadrant-2026'],
    false,
    '10000001-0000-0000-0000-00000000a771'::uuid,
    now() - interval '12 hours'
  ),
  (
    '20000006-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    null,
    'external',
    'https://news.ycombinator.com/item?id=39804521',
    'low',
    'neutral',
    null,
    'HN thread "Why every B2B startup is rebuilding their CRM in Notion" — 142 comments, 387 upvotes. Discussion of CRM friction.',
    'Low severity: no direct brand mention but adjacent narrative shift. Could surface as Tavily signal in radar sweep.',
    array['https://news.ycombinator.com/item?id=39804521'],
    false,
    '10000001-0000-0000-0000-00000000a771'::uuid,
    now() - interval '18 hours'
  ),
  (
    '20000007-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    '00000002-0000-0000-0000-00000000a771'::uuid,
    'competitor',
    'https://salesforce.com/blog/agentforce-2-0-launch',
    'low',
    'neutral',
    null,
    'Salesforce Agentforce 2.0 marketing post (last week). Positioning as "agentic AI for the enterprise". No new pricing.',
    'Low severity: marketing post not technical launch. Tracked для future radar correlation if Salesforce escalates.',
    array['https://salesforce.com/blog/agentforce-2-0-launch'],
    false,
    '10000001-0000-0000-0000-00000000a771'::uuid,
    now() - interval '36 hours'
  ),
  (
    '20000008-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    null,
    'peec_delta',
    'https://app.peec.ai/projects/or_d9869f1c-3586-43f1-a994-c63125459aad/brands/salesforce',
    'low',
    'negative',
    1.5,
    'Salesforce sentiment trending negative on "lightweight CRM" prompts (3 negative mentions about complexity past 7d). Position 1.5 — mentioned first but in critical context.',
    'Low severity: pattern, not crisis. Opportunity для Attio counter-positioning content.',
    array['peec-snapshot:2026-04-25T08:00Z', 'https://app.peec.ai/projects/or_d9869f1c-3586-43f1-a994-c63125459aad/brands/salesforce'],
    false,
    '10000001-0000-0000-0000-00000000a771'::uuid,
    now() - interval '4 hours'
  );

-- ============================================================
-- 5. Counter-draft for the high-severity HubSpot signal
-- ============================================================

insert into counter_drafts (id, organization_id, signal_id, status, body, channel_hint, tone_pillar, reasoning, evidence_refs)
values (
  '30000001-0000-0000-0000-00000000a771'::uuid,
  '00000000-0000-0000-0000-00000000a771'::uuid,
  '20000001-0000-0000-0000-00000000a771'::uuid,
  'draft',
  'HubSpot just announced Breeze AI Sales Agent. Here''s the difference: HubSpot bolts AI onto a CRM built for forms and pipelines. Attio was built AI-first — every record, every filter, every workflow assumes an agent might touch it. That''s why Attio teams ship custom AI workflows in an afternoon, not a quarter. Want a 15-min demo of what AI-native actually looks like?',
  'linkedin',
  'confident-builder',
  'Position differentiation: "AI-native vs AI-bolted" framing. Avoids attacking HubSpot directly — focuses on architectural difference. CTA: 15-min demo (low friction). Channel: LinkedIn (where B2B SaaS buyers compare options).',
  array['20000001-0000-0000-0000-00000000a771', 'https://hubspot.com/products/breeze-ai-sales-agent']
);

-- ============================================================
-- 6. Brief delivery from yesterday (W6′ history)
-- ============================================================

insert into brief_deliveries (id, organization_id, delivery_date, channel, recipient, status, summary_body, sent_at, run_id)
values (
  '40000001-0000-0000-0000-00000000a771'::uuid,
  '00000000-0000-0000-0000-00000000a771'::uuid,
  (current_date - interval '1 day')::date,
  'slack',
  '#bbh',
  'sent',
  E'*Daily Brand Brief — Attio*\n\nYesterday: 2 medium signals + 5 low. No crises. Brand pulse stable.\n\n• HubSpot teasing AI Sales Agent (full launch today — see today''s brief).\n• Salesforce Q1 earnings: pivot to "next-gen CRM" framing.\n\nNo drafts pending review. Visibility steady on "Salesforce alternatives" prompt set (0.32 vs 0.31 day-over-day).',
  now() - interval '1 day',
  '10000001-0000-0000-0000-00000000a771'::uuid
);

-- ============================================================
-- 7. Synthetic narrative_variants run (W5 simulator)
-- ============================================================

-- Synthetic simulator run row
insert into runs (id, organization_id, function_name, event_payload, ok, stats, started_at, finished_at)
values (
  '10000002-0000-0000-0000-00000000a771'::uuid,
  '00000000-0000-0000-0000-00000000a771'::uuid,
  'narrative-simulator',
  '{"organization_id":"00000000-0000-0000-0000-00000000a771","seed_type":"competitor-move","seed_payload":{"signal_id":"20000001-0000-0000-0000-00000000a771"},"requested_by":null,"num_variants":3}'::jsonb,
  true,
  jsonb_build_object(
    'function_name', 'narrative-simulator',
    'started_at', (now() - interval '90 minutes')::text,
    'duration_seconds', 42,
    'variants_generated', 3,
    'prompts_per_variant', 5,
    'models_used', jsonb_build_array('gpt-4o', 'claude-sonnet-4-5'),
    'cost_usd_cents', 4
  ),
  now() - interval '90 minutes',
  now() - interval '90 minutes' + interval '42 seconds'
)
on conflict (id) do nothing;

-- 3 ranked variants of the counter-narrative to HubSpot Breeze AI launch
insert into narrative_variants (id, organization_id, simulator_run_id, seed_signal_id, seed_counter_draft_id, rank, body, score, score_reasoning, predicted_sentiment, avg_position, mention_rate, evidence_refs)
values
  (
    '50000001-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    '10000002-0000-0000-0000-00000000a771'::uuid,
    '20000001-0000-0000-0000-00000000a771'::uuid,
    '30000001-0000-0000-0000-00000000a771'::uuid,
    1,
    'AI-native vs AI-bolted: HubSpot announces Breeze. Attio was already there. Every record, filter, and workflow in Attio assumes an agent might touch it. That''s why Attio teams ship custom AI flows in an afternoon, not a quarter.',
    0.683,
    'Strong differentiation framing without attacking HubSpot directly. "Architecture matters" angle resonates with technical buyers. Mentioned in 4 of 5 test prompts (80% rate), avg position 1.5.',
    'positive',
    1.5,
    0.800,
    array['20000001-0000-0000-0000-00000000a771', 'https://attio.com/automations']
  ),
  (
    '50000002-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    '10000002-0000-0000-0000-00000000a771'::uuid,
    '20000001-0000-0000-0000-00000000a771'::uuid,
    '30000001-0000-0000-0000-00000000a771'::uuid,
    2,
    'HubSpot adds AI agents. Attio was rebuilt around them. The difference: bolt-on AI works for one workflow at a time. AI-native means your CRM evolves with what your team learns next week.',
    0.520,
    'Same core argument but less concrete. "Evolves with what your team learns" is good but vague. Mentioned in 3 of 5 prompts (60%), avg position 2.0.',
    'neutral',
    2.0,
    0.600,
    array['20000001-0000-0000-0000-00000000a771']
  ),
  (
    '50000003-0000-0000-0000-00000000a771'::uuid,
    '00000000-0000-0000-0000-00000000a771'::uuid,
    '10000002-0000-0000-0000-00000000a771'::uuid,
    '20000001-0000-0000-0000-00000000a771'::uuid,
    '30000001-0000-0000-0000-00000000a771'::uuid,
    3,
    'Welcome to AI sales agents, HubSpot — happy you''re joining. We''ve been here for two years. If you want the version built for teams that move fast, take Attio for a spin.',
    0.234,
    'Tone leans cheeky/competitive. May read as smug. Mentioned in 2 of 5 prompts (40%), avg position 3.5. Predicted sentiment slightly negative — flag for brand voice review.',
    'negative',
    3.5,
    0.400,
    array['20000001-0000-0000-0000-00000000a771']
  );

-- ============================================================
-- 8. Cost ledger entries для radar + simulator runs
-- ============================================================

insert into cost_ledger (organization_id, service, operation, tokens_or_units, usd_cents, run_id, created_at)
values
  ('00000000-0000-0000-0000-00000000a771'::uuid, 'tavily', 'search', 5, 1, '10000001-0000-0000-0000-00000000a771'::uuid, now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000a771'::uuid, 'openai', 'classify', 1820, 2, '10000001-0000-0000-0000-00000000a771'::uuid, now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000a771'::uuid, 'anthropic', 'counter-draft', 1450, 3, '10000001-0000-0000-0000-00000000a771'::uuid, now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000a771'::uuid, 'openai', 'simulator-generate', 4200, 2, '10000002-0000-0000-0000-00000000a771'::uuid, now() - interval '90 minutes'),
  ('00000000-0000-0000-0000-00000000a771'::uuid, 'anthropic', 'simulator-rank', 1100, 2, '10000002-0000-0000-0000-00000000a771'::uuid, now() - interval '90 minutes');
