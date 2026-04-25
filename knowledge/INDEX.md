# Knowledge index

> Роутер для `knowledge/*`. Коли релевантна доменна папка — клікни і читай три файли: `knowledge.md` (факти), `hypotheses.md` (непідтверджені), `rules.md` (правила).

**Як користуватись:** перед задачею — сканеш цей файл, підбираєш домени які стосуються запиту, читаєш їх. Після задачі — оновлюєш якщо навчився нового.

---

## Домени

- [architecture/](architecture/) — високорівневі вибори системи (webapp stack, Supabase storage, Inngest orchestration, step boundary). Читай коли йдеться про structural зміни, нові pipeline'и, або коли треба пояснити "чому саме так".
- [peec-integration/](peec-integration/) — нюанси Peec MCP API (quota, rate limits, response shape, helpful edge-case behavior). Читай коли змінюєш будь-що що б'є Peec.
- [voice-delivery/](voice-delivery/) — Telli voice-agent vs TTS fallback chain. Читай коли торкаєшся morning-brief output, call window налаштувань, або додаєш новий провайдер.
- [competitive-intel/](competitive-intel/) — як ми визначаємо severity, що рахується "move", що — шум, brand-specific competitor lists. Читай коли змінюєш competitor-radar (W9).
- [hackathon-demo/](hackathon-demo/) — вся специфіка 2026-04-25 demo: storyboard timing, seeded data, fallback rules, що показувати / що ховати. Читай за тиждень до demo і кожен день останнього тижня.
- [brand-voice/](brand-voice/) — як пишемо counter-drafts, tone pillars, список заборонених фраз, PII rules для competitors. Читай коли генеруєш текст під brand.
- [user-prefs/](user-prefs/) — specific preferences Glib'а які виходять за межі anti-ai-writing-style.md. Мова спілкування, tolerance до питань, як подавати варіанти. Читай завжди на старті сесії.

---

## Коли треба створити новий домен

Якщо задача не лягає в жоден існуючий — створюй новий. Приклади що варті власного домену:

- Новий external provider (наприклад, Firecrawl якщо стане first-class) → `firecrawl-integration/`.
- Новий pipeline який має свою складну логіку → `pipeline-{name}/`.
- Новий бренд в workspace зі своїми особливостями → `brand-{id}/` (тільки brand-specific речі, не дублюй architecture).
- Specifics deploy'у Supabase/Vercel якщо набереться достатньо нюансів → `infra/`.

Процедура — в `CLAUDE.md` → Block A → "Як створювати новий домен".

---

## Housekeeping

- Додаючи новий домен — додай сюди один рядок.
- Видаляючи — прибирай рядок і в commit message поясни чому.
- Не пиши сюди контент — тільки посилання і однорядковий hook.
