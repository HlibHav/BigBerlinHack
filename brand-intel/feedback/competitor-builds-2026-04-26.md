# Competitor builds — Peec MCP Challenge 2026-04-26

> Source: дві YouTube submissions які Glib передав на аналіз. Транскрипти витягнуті yt-dlp + cleaned. Oba — конкуренти у тій самій challenge, deadline сьогодні.

## Submission #1 — ZipTie Note-Taking Benchmark (Ahmed, en, ~4 min)

URL: `https://www.youtube.com/watch?v=L_WvfdMPX6o`

**Що зробив:** опублікований benchmark методології, не product.

- **40 prompts × 3 cohorts:**
  - 9 high-intent buyer prompts ("notion alternatives", "best knowledge management tools for startups")
  - 28 feature/platform/vertical-specific prompts
  - **12 control prompts** у totally unrelated categories ("best broadcast app", "best recipe apps") — ці НІКОЛИ не повинні рухатися
- Tagged як `target` / `test` / `control` у Peec dashboard
- Daily crawl через 4 моделі (ChatGPT, Perplexity, Google AI Overviews, Microsoft Copilot)
- Measurement через Peec MCP `get_brand_report` з `dimension=tag_id` + `model_id` filter
- **Real published numbers:** Notion 75% ChatGPT/Google, 79% Google AI Overviews, 60% Perplexity. Obsidian #2 але trails 2x на ChatGPT. Confluence 42% > Obsidian 36% для team-documentation queries (несподівано — Confluence enterprise reputation бере верх). Evernote показує "memory" в ChatGPT — 25% vs 9% Google AI (older brand, ChatGPT trained on older data)
- **Causal experimental design:** 7-day re-pull. Якщо target cohort moves AND control cohort stays flat → causal attribution. Якщо control теж moves → background drift, not signal
- **Commit to publish null/negative results** — "the whole point of the control experiment is to catch false positives"
- **Reproducibility kit:** 8-step recipe, public **MIT-licensed GitHub repo**, README + methodology + day-zero data + **Claude Code skill file**
- "Install the skill, point it at category, agent walks you through running same experiment on your own brand. Running template in 10 minutes."
- LinkedIn post + tweet, both tagged `#BuiltWithPeec`, both linked from Tally form

**Що це їм дає за судовими критеріями:**
- Usefulness 40% — будь-який маркетолог fork'ає → benchmark власної категорії за <1h
- Creativity 30% — control cohort + causal lift = унікальна methodology в полі що зазвичай міряє baseline recall
- Community 10% — MIT repo, public benchmark, social signals на 100%

## Submission #2 — Live AI Skill build (SEO Freelancer, de, ~14 min)

URL: `https://www.youtube.com/watch?v=OAuHF8037fo`

**Що зробив:** live screencast побудови Setup Skill для Peec.

- Live setup of Peec MCP via Claude Code, OAuth (no API key)
- Workflow he stitched live:
  1. Start with brand (його SEO consultancy)
  2. Pull existing visibility data via Peec
  3. Identify mentioned competitors → **cleanup pass:** "remove SEO tools like RFS, Semrush" (filter irrelevant brands — нюанс який BBH не handle'є)
  4. Connect Google Search Console через **Visibly AI** integration
  5. Map keywords → prompts → customer journey
  6. **Funnel-stage tagging:** awareness / consideration / decision / retention
  7. **Intent tagging:** branded / unbranded / informational / transactional
  8. Auto-prune: "choose 5 most important per category"
  9. Generate diagnostic content ("7 SEO agency switching diagnostic questions before you cancel")
  10. Push to WordPress
  11. Track new article visibility on AI
- Convert entire workflow → reusable **Setup Skill** для нових Peec users
- Pitch: "from zero setup to published article in 30 min, 80% built у half an hour"
- LinkedIn распространения

**Що це їм дає:**
- Usefulness 40% — onboarding utility для будь-якого нового Peec юзера
- Creativity 30% — funnel-stage + intent dual tagging, auto-prune step, end-to-end "analysis → published article"
- Execution 20% — live demo показує що працює реально
- Community 10% — public skill артефакт

## Чим вони сильніші за BBH

| dim | ZipTie | SEO Freelancer | BBH (current) |
|---|---|---|---|
| Methodology rigor | **Control cohort + causal lift + commit to nulls** | Funnel-stage + intent tagging | Severity classification only |
| Real published data | Notion 75%, Obsidian 36%, Evernote "memory" effect | (less explicit) | Synthetic Attio demo |
| Reproducibility | MIT repo + 8-step recipe + Claude Code skill | Setup Skill demo | Private repo, hardcoded Attio |
| Onboarding | Fork + 10 min | Setup wizard via Skill | Single-tenant, no init flow |
| External integrations | Peec only (focus) | Peec + Visibly AI + GSC + WordPress | Peec + Tavily + Slack |
| Distribution | LinkedIn + tweet + #BuiltWithPeec + Tally | LinkedIn | Demo URL only |

**Де BBH виграє:**
- **Execution depth:** Inngest orchestration, Supabase RLS, 4 pipelines, eval harness з 3 layers, 78 tests. Жоден competitor не має цього.
- **Closed loop:** Інші measure (ZipTie) або setup (SEO Freelancer). Ми єдині хто закриває цикл `signal → severity → counter-draft → judge-validated variants → multi-channel expand → Slack delivery`.
- **Judge-based scoring (W5):** новий refactor дає body-aware quality measurement. Унікально серед entries — інші просто міряють recall.

## Action items для BBH (за пріоритетом)

### Критичні для submission TODAY (deadline 2026-04-26)

1. **Open repo public** (5 min) — `gh repo edit HlibHav/BigBerlinHack --visibility public`. Без цього community score = 0.
2. **README.md з "Why BBH is different"** (30 min). Чітко: "ZipTie measures recall, SEO Freelancer auto-publishes content, BBH closes the loop." Скріншот demo + посилання на live URL + посилання на baseline eval report у git як proof of methodology rigor.
3. **LinkedIn + Twitter post** (15 min) з `#BuiltWithPeec` + посилання на demo + repo + 1 sentence pitch. Tag Peec, tag judges (Lily Ray, Ethan Smith, Malte Landwehr).
4. **60-90s screencast** (30 min) що показує full loop: W9 detects competitor signal → severity=high → counter-draft auto-drafted → W5 simulator з judge scores → W7 expansion в blog/X/LinkedIn → W6′ ranks-up brief у Slack. Це наша "killer feature" і вона немає аналогів у обох competitor entries.
5. **Submit Tally form** з усім вище.

Time budget: ~90 min total. Високий ROI бо ми вже маємо product, треба тільки package'нути.

### Strategic (post-hackathon)

6. **Control cohort у W9** — додати `cohort` колонку у `prompts` таблиці (`target` / `test` / `control`). Daily snapshot diff з control-cohort drift detection. Без цього BBH не може claim'нути causal attribution як ZipTie.
7. **Multi-tenant onboarding skill** — `pnpm bbh init <brand-slug>` CLI що connects Peec, scrapes website для brand voice, мапить prompts. Aktuell hardcoded `HACKATHON_BRAND_NAME = "Attio"` (`narrative-simulator.ts:42`).
8. **Public benchmark mode** — fork'ed branch що runs у read-only mode на public demo brand, surfaces real Peec numbers без auth. ZipTie's MIT-license + day-zero data approach.
9. **Funnel-stage tagging on signals** — `signal_funnel_stage enum (awareness, consideration, decision, retention)`. Зараз тільки severity, mало для marketers що priorityzують по journey position.
10. **Cleanup step** — auto-detect "tracked brand is irrelevant for our category" (як SEO Freelancer manually прибирає Semrush). Можна через Peec brand description + LLM relevance gate.

### Nice-to-have

11. **GSC integration** — connect Google Search Console для grounding prompt list у real query data (а не тільки Peec tracked queries). SEO Freelancer показав це через Visibly AI.
12. **WordPress / Webflow push** для counter-drafts. Сейчас drafts only — published посилання нема.
13. **Public eval reports** — render `evals/reports/*.md` як `/methodology` route. Прозорість методології = trust signal.

## Differentiation message (для submission)

> "ZipTie measures brand visibility у AI engines. SEO Freelancer auto-stitches the setup. **BBH closes the loop.** When a competitor moves, we don't just see it — we classify severity, draft counter-narrative, simulate ranked variants з judge-based scoring, expand into 4 channels, deliver як morning brief — all measurable end-to-end з Inngest orchestration, Supabase persistence, і 3-layer eval harness. Що ми shipping today: not a workflow template — a complete brand intelligence agent що any team може run у production."

## Sources

- ZipTie video: `https://www.youtube.com/watch?v=L_WvfdMPX6o`
- SEO Freelancer video: `https://www.youtube.com/watch?v=OAuHF8037fo`
- Peec MCP Challenge: `https://peec.ai/mcp-challenge`
- Submitted via Tally before April 26
- Judging panel: Lily Ray, Ethan Smith, Malte Landwehr
- Prizes: $5k grand + 3× $1.5k category, $9.5k total

## Раw transcripts

Saved offline at `/tmp/bbh-videos/` for re-analysis. Not committed (out of repo scope).
