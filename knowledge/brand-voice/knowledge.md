# Brand voice — knowledge

> Як пишемо тексти під brand (counter-drafts, brief phrasing).

## Per-brand source

- **2026-04-24:** Voice pillars і tone визначені в `positioning.pillars` і `voice.tone` BrandContext. Ніколи не hardcode в skill. Source: CONTRACTS.md §1.
- **2026-04-25 update:** Plugin-era `BrandContext YAML` superseded by Supabase row у `organizations` table (post-hackathon: add `brand_voice_summary text` column per `features/content-expansion.md §2`). Hackathon — hardcoded brand voice prompt у W7 LLM call.

## Workspace-level defaults

- **2026-04-24:** Поза BrandContext — за замовчуванням дотримуємось `~/Glib's workspace/CLAUDE COWORK/ABOUT ME/anti-ai-writing-style.md`. Source: global CLAUDE.md.
- **2026-04-24:** Коротко: prose > bullets, concrete numbers, opinions > list of options, human-detectable writing. Source: global CLAUDE.md.

## Content boundaries

- **2026-04-24:** Counter-drafts довжиною ≤280 символів для X (single tweet) або ≤1300 для LinkedIn. Якщо draft виходить за ліміт — skill має автоматично обрізати на смисловій межі або переформатувати у thread. Source: GAPS.md §8.
- **2026-04-24:** Заборонені patterns в drafts: exaggerated claims without data, PII про competitor team, політичні/релігійні трактовки, disparagement tone. Source: GAPS.md §8.
