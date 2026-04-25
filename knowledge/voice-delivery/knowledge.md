# Voice delivery — knowledge

> Як доставляємо morning-brief голосом. Mode A (TTS) vs Mode B (voice-agent Telli).
>
> **2026-04-25 status:** ENTIRE DOMAIN `[DEFERRED — W6 voice cut by hackathon scope, superseded by W6′ Slack send]`. Hackathon morning brief = text → Slack incoming webhook (per `decisions/2026-04-25-peec-overlay-pivot.md` + `brand-intel/features/morning-brief.md`). Knowledge here preserved for post-hackathon Telli/ElevenLabs reactivation. Was: also referenced `BrandContext YAML` (plugin-era, also superseded).

## Modes

- **2026-04-24:** Два режими, обираються через `voice.mode` у BrandContext.
  - `tts` — one-way audio playback (ElevenLabs/macos-say). Fallback за замовчуванням.
  - `voice-agent` — Telli робить outbound call founder'у, injects brief у prompt, може відповідати на live questions. Source: CONTRACTS.md §9.4.
- **2026-04-24:** Telli — provider з позиціонуванням "every customer call handled by AI". API = voice-agent level, не pure TTS. Source: CONTRACTS.md §9.4.

## Config surface

- **2026-04-24:** `voice:` block у BrandContext YAML має: `mode`, `provider`, `api_key_env`, `agent_id`, `callee_number`, `call_window`, `max_duration_seconds`, `store_recording`. Source: CONTRACTS.md §1 (updated 2026-04-24).

## Failure fallback chain

- **2026-04-24:** Якщо `voice-agent` fail'ить (Telli API down, call didn't connect) — fallback на `tts` з ElevenLabs. Якщо і це fail'ить — fallback на `macos-say`. Якщо і це — просто markdown brief без audio. Source: CONTRACTS.md §9.4.
