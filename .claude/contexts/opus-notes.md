# Opus 4.7 Workflow Notes

> Lazy-loaded коли user prompt згадує: opus, model, calibration, parallelism, plan tier, AskUserQuestion, agent

Calibration для цієї моделі в цьому проєкті:

- **Довірити більше:** складні Zod schemas, RLS policy дизайн, Inngest step decomposition. Модель справляється.
- **Перевіряти особливо:** migration DDL syntax (Postgres quirks), shadcn install paths (вони змінюються), Inngest event shape drift між функціями.
- **Не економити на плані для Tier 2+.** 5 хвилин плану зберігають 30 хв rework.
- **Paralelism у Agent tool:** коли запускаєш кілька незалежних агентів (Explore + code-reviewer) — в одному message-у. Sequential wastes time.
- **Memory verification threshold: 14 днів.** Будь-яка пам'ять старіше 14 днів — verify через Read/grep перед тим як покладатись. Особливо для external API specifics — currently active: Peec MCP snapshot shape (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`), Tavily, Slack webhook. Deferred: Telli callback shape, ElevenLabs TTS args.
- **AskUserQuestion перед Tier 2/3** — не вгадуй. Краще 1 питання ніж 2 години rework.
