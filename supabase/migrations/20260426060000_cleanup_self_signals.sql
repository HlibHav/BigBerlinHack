-- Data cleanup: видалити signals і counter_drafts які referenced Attio (own brand)
-- як зовнішнього competitor. Bug у competitor-radar.ts:165-176 (фікс у commit
-- 3abf1e9) пропускав relationship='self' через radar → Tavily search "Attio CRM"
-- генерував шумовий fan-out до own brand. Migration ідемпотентна — наступне
-- run буде no-op бо стейл рядки вже видалені.
--
-- Залежності: signals.competitor_id ON DELETE SET NULL — DELETE competitors не
-- допоможе, треба явно видалити сигнали + drafts.

with self_competitors as (
  select id from competitors where relationship = 'self'
),
self_signals as (
  select id from signals where competitor_id in (select id from self_competitors)
),
self_drafts as (
  select id from counter_drafts where signal_id in (select id from self_signals)
)
-- 1. content_variants attached до self drafts (W7 expansions)
delete from content_variants where parent_counter_draft_id in (select id from self_drafts);

with self_competitors as (
  select id from competitors where relationship = 'self'
),
self_signals as (
  select id from signals where competitor_id in (select id from self_competitors)
)
-- 2. narrative_variants seeded від self signals (W5 simulator outputs)
delete from narrative_variants where seed_signal_id in (select id from self_signals);

with self_competitors as (
  select id from competitors where relationship = 'self'
),
self_signals as (
  select id from signals where competitor_id in (select id from self_competitors)
),
self_drafts as (
  select id from counter_drafts where signal_id in (select id from self_signals)
)
-- 3. narrative_variants seeded від self counter_drafts
delete from narrative_variants where seed_counter_draft_id in (select id from self_drafts);

with self_competitors as (
  select id from competitors where relationship = 'self'
),
self_signals as (
  select id from signals where competitor_id in (select id from self_competitors)
)
-- 4. counter_drafts attached до self signals
delete from counter_drafts where signal_id in (select id from self_signals);

-- 5. signals для self brand (включно з draft 'Tavily noise про Atara/Barclays
--    які LLM хибно класифікував як Attio)
delete from signals where competitor_id in (
  select id from competitors where relationship = 'self'
);
