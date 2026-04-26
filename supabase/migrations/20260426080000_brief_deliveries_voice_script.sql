-- W6′ voice path — store a natural-language rewrite of the Slack brief that
-- Gradium TTS can render to audio. Slack send remains untouched: we generate
-- the voice_script AFTER persist-delivery so a Slack failure never blocks
-- the audio version, and a TTS failure never breaks the Slack message.
--
-- Per brand-intel/features/morning-brief.md (W6′ active path) — Slack stays
-- ground truth, voice is opt-in playback inside dashboard MorningBriefPanel.

alter table brief_deliveries
  add column if not exists voice_script text;

comment on column brief_deliveries.voice_script is
  'Natural-language rewrite of summary_body for TTS rendering. Generated post-Slack-send via Gemini Flash. Null until rewrite step completes; UI hides voice button when null.';
