# Voice delivery — rules

> **2026-04-25:** Domain `[DEFERRED — W6 voice cut]`. Rules re-apply only якщо post-hackathon W6 reactivated. Hackathon delivery — Slack text (W6′), no voice constraints.

- **Hard 200-word limit перед TTS.** Будь-який brief-текст що йде на TTS провайдер обрізаний до ≤200 слів. Source: GAPS.md §8, confirmed 2026-04-24.
- **Privacy defaults.** `store_recording: false` за замовчуванням для voice-agent mode. Глобальна зміна — explicit user request. Source: CONTRACTS.md §9.4.
- **Fallback chain завжди увімкнений.** Ніколи не кидай hard error на перший fail voice provider'а. Завжди переходь по ланцюгу `voice-agent` → `elevenlabs` → `macos-say` → `markdown-only`. Source: CONTRACTS.md §9.4.
