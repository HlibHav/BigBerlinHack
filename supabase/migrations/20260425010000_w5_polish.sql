-- W5 polish + W9 socials prep
-- 1. counter_drafts.selected_variant_id — audit pointer to chosen narrative_variant after "Use #N & expand"
-- 2. counter_drafts.published_at — closes the loop when Publish-to-channels button fires
-- 3. narrative_variants.metadata — jsonb для phrase_availability flags + lift_vs_baseline
-- 4. signals.metadata — jsonb для source_channel ("news"|"x"|"linkedin") з W9 socials supplement
-- 5. content_variants.sent_at — timestamp коли publishDraft() переводить status='sent'

alter table counter_drafts
  add column selected_variant_id uuid references narrative_variants(id) on delete set null,
  add column published_at timestamptz;

alter table narrative_variants
  add column metadata jsonb not null default '{}'::jsonb;

alter table signals
  add column metadata jsonb not null default '{}'::jsonb;

alter table content_variants
  add column sent_at timestamptz;

-- Helpful index for finding selected variants per draft
create index counter_drafts_selected_variant_idx on counter_drafts(selected_variant_id) where selected_variant_id is not null;
