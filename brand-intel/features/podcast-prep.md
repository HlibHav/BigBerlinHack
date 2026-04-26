# Podcast prep (W11) — feature requirements

> Founder отримав запрошення на подкаст. BBH готує retrieval-optimized brief: talking points, anticipated Q&A, brand-drop moments, topics to avoid. Мета — щоб транскрипт що з'явиться online (Spotify, YouTube, host site) crawl'ився AI engines і піднімав видачу бренду під the prompts які реально дають конверсію.

**Status:** post-hackathon roadmap. Plan only — реалізація після 2026-04-25 demo.
**Single source of truth (буде):**
- DB schema → `brand-intel/CONTRACTS.md §3` (`podcast_briefs` table — додати при реалізації).
- Inngest event → `brand-intel/CONTRACTS.md §1` (`podcast.prep-request` — додати).
- LLM output schemas → `brand-intel/CONTRACTS.md §2` (`PodcastBriefOutputSchema` сімейство).
- Pipeline behavior → `brand-intel/PIPELINES.md §W11`.
- Decision rationale → `decisions/2026-04-26-w11-podcast-prep.md` (створити при реалізації).

---

## 1. Why this feature

Більшість brand-intel інструментів оптимізують **written surface** (blog, X, LinkedIn). Podcast — це high-impact human moment що **генерує lasting AI-retrievable content**: транскрипт публікується на 5-10 surfaces (host site, Spotify show notes, YouTube auto-captions, Apple Podcasts, podcast aggregators), всі вони crawl'аються Google + AI engines. Один podcast = тривалий visibility tail на 6-12 місяців.

Проблема яку вирішуємо: фаундер приходить на подкаст з generic talking points. Він пам'ятає згадати продукт, але не пам'ятає згадати **specific claims що AI engines потім retrieve'ять** (числа, feature names, customer outcomes). Результат — транскрипт існує, але "Notion 75% / Confluence 42%" типу retrievable specifics нема. AI engines не цитують vague mentions.

W11 — це не traditional media training. Це **podcast SEO для AI engines**: optimize talking points + Q&A so що транскрипт буде максимально retrievable.

Differentiation vs два MCP Challenge competitor builds (per `feedback/competitor-builds-2026-04-26.md`): жоден не покриває spoken-word surface.

---

## 2. User journey

1. Фаундер відкриває dashboard tab **"Podcast Prep"**.
2. Empty state: "Got a podcast invite? Generate retrieval-optimized brief in ~60s."
3. Натискає **"+ New brief"**, заповнює форму (5 полів — див. §3).
4. Submit → server action emits `podcast.prep-request`.
5. Within ~60s W11 Inngest function завершується, у tab з'являється новий brief card.
6. Click → brief detail page з усіма секціями (§4) + judge verdict + download as Markdown.
7. На день подкасту фаундер відкриває brief на телефоні. Mobile-first layout.

---

## 3. Inputs (form fields)

Фаундер заповнює одну форму перед генерацією:

- **Podcast name** — text, required.
- **Host name** — text, required (single string; multiple hosts OK як comma-separated).
- **Audience** — textarea, required, ≤300 chars. Examples: *"early-stage SaaS founders, ~10k weekly listeners, mostly US/UK"*, *"RevOps managers at 100-1000 person B2B companies"*.
- **Episode topic** — textarea, required, ≤300 chars. Examples: *"how AI is reshaping CRM workflows"*, *"the death of the SDR role"*.
- **Previous episode URLs** — array of URLs, optional, ≤3. Used by step 2 для tone calibration через Tavily fetch.
- **Scheduled date** — date picker, optional. Used to prioritize брief queue.

Form validation: Zod schema `PodcastPrepRequestSchema` в `lib/schemas/podcast-brief.ts`.

---

## 4. Outputs (brief sections)

Brief — single Markdown document persisted в DB column `markdown_brief text` плюс structured fields у jsonb для UI rendering.

Sections:

### 4.1 TL;DR
3 bullets: top talking point, top brand-drop moment, top topic to avoid.

### 4.2 Talking points (5-7)
Per item:
- **Headline** (1 sentence, sound bite quality)
- **Proof point** (number, feature name, customer outcome — щось verifiable)
- **Suggested phrasing** (2-3 sentences як фаундер може це сказати, brand-voiced)
- **Retrievability score** 1-10 з reasoning (judge step)
- **Maps to AI prompt:** яка з tracked Peec prompts likely to surface цей claim post-publication

### 4.3 Anticipated Q&A (6-10)
Per item:
- **Question** (likely host phrasing based on host's previous episodes + episode topic)
- **Suggested answer** (≤120 words, brand-voiced, з натуральним brand mention + concrete proof)
- **Why host might ask** (tie to W9 signal, competitor move, або general industry context)
- **Pitfall to avoid** (1 sentence — common founder trap відповідаючи на це питання)

### 4.4 Brand-drop moments (3-5)
Organic спекти у розмові де brand mention fits naturally:
- **Trigger phrase** (e.g. "коли host питає про tech stack")
- **Suggested mention** (1 sentence)
- **Specificity boost** (concrete claim що йде разом з mention)

### 4.5 Topics to avoid (3-5)
Per item:
- **Topic** (1 sentence)
- **Чому ризик** (e.g. recent W9 high-severity signal без clean response, чи competitor outperformance де brand слабший)
- **Pivot suggestion** (як elegantly redirect якщо host raises це)

### 4.6 Judge verdict + top fixes
Single judge call (claude-sonnet-4-5) rates the WHOLE brief на 4 dimensions (1-10 кожна):
- **Retrievability** — як likely AI engine процитує брend post-publication
- **Naturality** — чи звучить як natural conversation, не як sales pitch
- **Specificity** — concrete claims vs vague abstractions
- **Coverage** — наскільки comprehensive vs gaps

Plus `top_fixes: string[]` з конкретними peace-of-mind tweaks для founder.

---

## 5. Pipeline (W11 step graph)

Inngest function trigger: `podcast.prep-request` event з `PodcastPrepRequestSchema` payload (organization_id, podcast_name, host_name, audience, episode_topic, previous_episode_urls, scheduled_date, requested_by).

Steps:

0. **create-run-row** — placeholder runs row, ok=false.
1. **gather-context** — last 7d W9 signals + Peec snapshot baseline (own brand + competitors + tracked prompts) + active counter-drafts (last 14d) + brand voice pillars.
2. **resolve-podcast-context** — якщо `previous_episode_urls.length > 0`, Tavily fetch для кожного (capped MAX_TAVILY_PER_W11_RUN=3), extract host bio + recent topics. Cache в `metadata.host_calibration`.
3. **generate-talking-points** — single `claude-sonnet-4-5` call. Output 5-7 talking points (Zod-validated). System prompt інлайнує brand voice rules + forbidden lists через `renderForbiddenListForPrompt()`. Hint: "designed для transcript indexed by AI engines — кожен point must contain a concrete proof".
4. **generate-anticipated-qa** — single `gpt-4o` call (cheaper, longer-form generation). Output 6-10 questions+answers. Кожна answer ≤120 words.
5. **generate-brand-drop-moments** — `gpt-4o` call. Output 3-5 organic mention spots.
6. **generate-avoidance-list** — `gpt-4o` call з explicit input з W9 high-severity signals last 14d що не мають approved counter-draft. Output 3-5 topics + pivots.
7. **judge-brief** — `claude-sonnet-4-5` single call rates ALL sections together. Returns `judge_score` 1-10, 4 dimensions, top_fixes string[]. Mirror судить pattern з `lib/services/variant-judge.ts`.
8. **assemble-brief** — render Markdown з усіх sections, sort talking points by retrievability_score desc, persist всі jsonb fields + markdown_brief в `podcast_briefs`.
9. **finalize-run** — runs row update з stats (sections_generated, total_llm_calls, judge_score, cost_usd_cents).

Cost envelope: ~$0.05/brief (sonnet talking points + 3× gpt-4o + sonnet judge ≈ $0.04-0.06).

---

## 6. Schema

### 6.1 New table `podcast_briefs`

Standard columns: `id uuid pk default gen_random_uuid()`, `organization_id uuid not null references organizations(id) on delete cascade`, `created_at timestamptz not null default now()`, `updated_at timestamptz`.

Feature columns:
- `podcast_name text not null`
- `host_name text not null`
- `audience text not null`
- `episode_topic text not null`
- `previous_episode_urls jsonb` — array of `{url, title, fetched_at}`
- `scheduled_date date`
- `talking_points jsonb` — array of `TalkingPoint`
- `anticipated_qa jsonb` — array of `AnticipatedQA`
- `brand_drop_moments jsonb` — array of `BrandDropMoment`
- `topics_to_avoid jsonb` — array of `TopicToAvoid`
- `judge_score numeric(3,2)` — 1-10 з .5 precision (1.00, 1.50, ..., 10.00)
- `judge_reasoning text`
- `judge_dimensions jsonb` — `{retrievability, naturality, specificity, coverage}` each 1-10
- `top_fixes jsonb` — array of strings
- `markdown_brief text not null` — pre-rendered, SSR-ready
- `simulator_run_id uuid references runs(id)` — link до run row
- `requested_by uuid references auth.users(id)` nullable
- `metadata jsonb` — escape hatch (host_calibration, source signal_ids, тощо)

RLS: standard `*_org_isolation` policy + `*_public_demo` дублікат для demo brand visibility.

Migration file: `supabase/migrations/{timestamp}_create_podcast_briefs.sql`.

**CRITICAL zone:** `supabase/migrations/**` per CLAUDE.md §4 — code-reviewer agent run обов'язковий.

### 6.2 Zod schemas (новий файл `lib/schemas/podcast-brief.ts`)

- `TalkingPointSchema` — headline, proof_point, suggested_phrasing, retrievability_score, maps_to_prompt
- `AnticipatedQASchema` — question, suggested_answer, why_host_asks, pitfall
- `BrandDropMomentSchema` — trigger, suggested_mention, specificity_boost
- `TopicToAvoidSchema` — topic, risk, pivot
- `PodcastBriefOutputSchema` — composes the four above + judge fields
- `PodcastPrepRequestSchema` — event payload
- `PodcastBriefRunStatsSchema` — runs.stats shape для W11

**CRITICAL zone:** `lib/schemas/**` per CLAUDE.md §4.

### 6.3 Event registration

Add `podcast.prep-request` до `lib/events.ts`. **CRITICAL zone.**

---

## 7. UI

### 7.1 Routes

- `app/(dashboard)/podcast-prep/page.tsx` — list of briefs + "+ New brief" button (opens form modal або inline).
- `app/(dashboard)/podcast-prep/[id]/page.tsx` — brief detail з усіма sections, mobile-optimized.
- `app/actions/podcast-prep.ts` — server action `triggerPodcastPrep(payload)` що emits Inngest event.

### 7.2 Components

- `components/dashboard/podcast-prep-form.tsx` — 5-field form з Zod client-side validation.
- `components/dashboard/podcast-brief-card.tsx` — list item: podcast name, host, scheduled date, judge score chip, click → detail.
- `components/dashboard/podcast-brief-detail.tsx` — full render of brief sections з collapsible groups + "Copy as Markdown" button + "Download .md" link.
- `components/dashboard/nav.tsx` — add "Podcast Prep" tab.

### 7.3 Mobile UX

Brief detail page MUST be readable on iPhone Safari 5x375px viewport. Sections collapsible. Talking points як cards з large tap targets. No horizontal scroll. Founder читатиме це під час подкасту.

---

## 8. Reuse from existing modules

- `lib/services/variant-judge.ts` — pattern for multi-dim Sonnet judge call. Не reuse напряму (різні output schemas) але mirror approach.
- `lib/services/openai.ts` + `lib/services/anthropic.ts` — LLM wrappers з cost ledger integration. Direct use.
- `lib/brand/forbidden-phrases.ts` — `renderForbiddenListForPrompt()` inline у все 4 generation prompts (steps 3-6).
- `lib/services/peec-snapshot.ts` — `loadPeecSnapshot()` + `getLatestBrandReport()` для baseline context.
- `lib/services/tavily.ts` — `tavilySearch()` для step 2 (previous episode fetch).
- `inngest/functions/narrative-simulator.ts` — pattern для step structure, run row management, cost finalization.
- `lib/schemas/run-stats.ts` — pattern для PodcastBriefRunStatsSchema.

---

## 9. Differentiation message (для роадмап announcement / blog)

> "ZipTie вимірює recall. SEO Freelancer auto-publishes. W7 BBH expands counter-drafts у 4 written channels. **W11 готує фаундера до high-impact spoken moment що generates lasting AI-retrievable transcript across 5-10 surfaces.** Один podcast = 6-12 місяців visibility tail. BBH — єдиний brand intelligence agent що покриває spoken word surface."

---

## 10. Non-goals v1

- Live podcast guidance (real-time AI prompts during recording — separate W11.5).
- Audio analysis of recorded podcasts (transcript ingestion + retrospective scoring — W11.6).
- Auto-scheduling brief refreshes для recurring podcast appearances.
- Multi-language briefs (EN-only first; UA/DE post-launch).
- Auto-publish brief до Notion/Slack для team alignment (post-launch integration).
- Booking podcast appearances (out of scope — outreach is separate).

---

## 11. Verification

1. `pnpm typecheck` + `pnpm test` green.
2. New tests:
   - `tests/schemas/podcast-brief.test.ts` — Zod parsing all 5+ schemas.
   - `tests/services/podcast-judge.test.ts` — mock Anthropic call, schema parse, dimension shape.
   - `tests/inngest/podcast-prep.test.ts` — handler з mock step, real LLM optional.
3. `supabase db reset` локально passes після migration. `pnpm types:gen` regenerated.
4. Triggering Inngest function через dashboard form → brief з'являється в DB + UI < 90s.
5. Cost ledger має row для кожного step з operation prefix `podcast-prep:*`.
6. Eval: новий `evals/podcast-judge.eval.ts` що judge'ує retrievability scoring consistency на 3 different fixture briefs (good/medium/bad).

---

## 12. Open questions (resolve при реалізації)

- Чи передавати W5 ranked variants як reference при talking-points generation? Could enrich якщо narrative simulator вже run для цього week's signals. Trade-off: contextual richness vs prompt bloat.
- Як гарантувати що brand mention frequency natural не spammy? Поточний approach — judge `naturality` dimension. Alternative: hard cap "не більше 3 brand mentions per talking point".
- Чи варто додати "competitor mention strategy" як окрему section? Founder might want guidance: коли OK to name competitor, коли краще generic ("legacy CRMs").
- Чи потрібен post-podcast retrospective режим (W11.6) — фаундер upload'є transcript, ми scoring'уємо як добре він hit'нув talking points + які retrievability gains realized?
- Чи інтегрувати з calendar (Google Calendar / Cal.com) для автодетекту upcoming podcast bookings? Post-launch.

---

## 13. Files affected (estimate)

**NEW:**
- `inngest/functions/podcast-prep.ts` (~400 LOC, complex pipeline)
- `lib/schemas/podcast-brief.ts` (~120 LOC) — **CRITICAL**
- `lib/services/podcast-judge.ts` (~150 LOC)
- `supabase/migrations/{timestamp}_create_podcast_briefs.sql` (~80 LOC) — **CRITICAL**
- `app/actions/podcast-prep.ts` (~50 LOC)
- `app/(dashboard)/podcast-prep/page.tsx` (~120 LOC)
- `app/(dashboard)/podcast-prep/[id]/page.tsx` (~200 LOC)
- `components/dashboard/podcast-prep-form.tsx` (~150 LOC)
- `components/dashboard/podcast-brief-card.tsx` (~80 LOC)
- `components/dashboard/podcast-brief-detail.tsx` (~250 LOC)
- `tests/schemas/podcast-brief.test.ts` (~120 LOC)
- `tests/services/podcast-judge.test.ts` (~100 LOC)
- `tests/inngest/podcast-prep.test.ts` (~80 LOC)
- `evals/podcast-judge.eval.ts` (~150 LOC, optional v1)

**MODIFIED:**
- `lib/events.ts` — add `PodcastPrepRequest` event type — **CRITICAL**
- `inngest/registry.ts` (or wherever functions are registered) — add `podcastPrep`
- `components/dashboard/nav.tsx` — додати "Podcast Prep" tab
- `lib/supabase/types.ts` — auto-regen після migration
- `brand-intel/CONTRACTS.md` — додати podcast_briefs schema + event + LLM output schemas
- `brand-intel/PIPELINES.md` — додати §W11 section

**CRITICAL zones touched:** `lib/schemas/**`, `lib/events.ts`, `supabase/migrations/**`. Per CLAUDE.md §4 — code-reviewer agent run обов'язковий перед commit на кожному з цих файлів.

---

## 14. Estimated work

3 sessions:

- **Session 1** (~2-3h): schema + migration + Zod schemas + LLM service stubs + tests. Code-reviewer run на CRITICAL zones.
- **Session 2** (~3-4h): Inngest pipeline (всі 9 steps) + server action + integration tests + eval harness.
- **Session 3** (~2-3h): UI form + brief detail page + nav integration + mobile QA + e2e smoke на live LLM.

Total: ~7-10h продуктивної роботи. Заходить у 2-3 working days.

---

## 15. Out of scope для цього плану

- Implementation timeline / sprint planning.
- Brand-specific copy (Attio voice tuning) — okrema iteration.
- Pricing / packaging як premium feature.
- Sales materials.
