---
date: 2026-04-24
status: accepted
topic: voice delivery for morning brief
supersedes: none
superseded_by: none
adr_ref: CONTRACTS.md §9.4 (brand-intel/)
---

# Morning brief доставляється через Telli voice-agent (mode B), з TTS fallback

## Context

Morning brief — ключовий UX-момент. Варіанти доставки: (a) текст → user читає сам, (b) одностороння TTS audio (ElevenLabs/macos-say), (c) voice-agent що дзвонить founder'у і проводить брифінг як розмову (Telli).

Glib уточнив під час hackathon prep (AskUserQuestion 2026-04-24): предпочитає Telli саме як voice-agent, не TTS. Це унікальний UX ("вранці мені дзвонить AI, я можу запитати", не "я слухаю плейлист").

## Decision

Two modes в `voice.mode`:
- **mode=voice-agent** — primary. Telli робить outbound call founder'у за розкладом `call_window`, вмикає brief як контекст prompt'а, приймає live questions.
- **mode=tts** — fallback mode. Якщо voice-agent недоступний (API down, call didn't connect) — перехід на ElevenLabs TTS (single-way playback). Якщо і це fail — macos-say. Якщо і це — markdown-only.

## Alternatives considered

- **TTS-only** — простіше у setup, але втрачаємо "розмовний" UX який робить цей agent distinctive. Відкинуто як primary.
- **Nothing voice, markdown only** — дешевше, але morning-brief втрачає частину demo appeal. Відкинуто як primary, збережено як last-resort fallback.
- **Custom voice agent replacing Telli** — overkill для hackathon deadline.

## Reasoning

- Voice-agent UX ("agent дзвонить мені") краще сedgage'ує з founder'ом ніж passive audio.
- Telli вже має API і production-grade infra — не треба будувати власне.
- Fallback chain гарантує що brief завжди доставиться у якійсь формі.

## Trade-offs accepted

- Залежність від Telli availability і pricing. Якщо API rate limit або вартість стрибне — fallback на TTS.
- Privacy: Telli може записувати дзвінки. Default `store_recording: false`, founder явно opt-in.
- Для demo — ризик live-call instability. Mitigation: pre-recorded backup у `demo/fixtures/` (GAPS.md §10).

## Revisit when

- Telli pricing стає >$X/month → переключити на TTS primary.
- Founder каже "набридло дзвонити щоранку" → переключити на TTS або markdown.
- З'являється alternative voice-agent provider з кращим API/pricing → reopen.
