# Gaps

> Чесний список відомих failure modes і недозакритих питань. Не "roadmap", не "wishlist" — те що ми знаємо що може зламатись, з статусом resolution. Якщо щось зламалось у production і не було у GAPS — update'имо сюди + incident postmortem.

**Version:** 2026-04-24 (post-pivot на webapp, re-audited). 2026-04-25 follow-ups: Telli/voice/widget/Firecrawl gaps moved to `[DEFERRED]` context per `decisions/2026-04-25-hackathon-scope-cut.md` + `decisions/2026-04-25-mcp-only-peec-attio-demo.md`. Peec gap (§1.1) supersesed by MCP-only access — see updated note. Попередня plugin-era версія — `_archive/GAPS.md`.

**Severity levels:**
- **CRITICAL** — демо провалиться, GDPR violation, security breach.
- **HIGH** — демо буде awkward, частина функціоналу не працює.
- **MED** — робить experience гірше, але recoverable.
- **LOW** — nuisance, post-demo cleanup.

---

## 1. External API dependencies

### 1.1 Peec snapshot file — drift between refresh windows `[REVISED 2026-04-25]`

**Status:** RESOLVED via strategy pivot. **Severity:** MED (was HIGH). **Owner:** Glib (manual refresh).

**Gap (revised).** Peec data accessed через MCP browser OAuth у Claude Code session, persisted у `data/peec-snapshot.json` (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`). Quota irrelevant — no live REST calls from server. Real risk: snapshot drift, тобто між refresh'ами Peec source state змінюється і ми show stale data. Acceptable для hackathon (refresh T-2h before demo); post-hackathon — TBD коли вирішується paid REST API.

**Mitigation plan:**
1. Refresh workflow documented у `RUNBOOK.md §1.5`. T-2h before demo — Glib runs "refresh peec snapshot" у Claude Code session.
2. Zod parse `PeecSnapshotFileSchema` (CONTRACTS §6.1) на load — bad data fails W9 fast з clear error.
3. `evidence_refs` для Peec-sourced signals point до snapshot timestamp + Peec dashboard deep link.
4. Якщо MCP unavailable — fallback hand-crafted fixture per Tavily search про Attio/Salesforce/HubSpot.

**Resolution trigger:** RESOLVED. Strategy locked у ADR.

**Was (2026-04-24):** "Peec MCP quota ~500 req/day на free tier, перед demo manual test 100 calls/hour" — disproven. Peec has no free tier; Challenge gives MCP-only access; no server-side calls.

---

### 1.2 Telli call — latency + voicemail detection `[DEFERRED — W6 voice cut by hackathon scope, gap re-applies post-reactivation]`

**Status:** DEFERRED. **Severity:** HIGH (when reactivated). **Owner:** pre-demo verify з real phone.

**Gap.** Telli voice-agent quality для українського brief — не тестовано. Open questions:
- Чи правильно вимовляє українські slug'и (brand names "самопромо", "vck")?
- Яка latency від `telli.create_call` до ring на phone? (assumed <10s).
- Чи надійна voicemail detection? Якщо goes to voicemail — чи ми правильно tag'уємо у `voice_call_results.outcome`?

**Mitigation:**
1. Record backup pre-generated audio (`public/demo-fixtures/morning-brief-demo.mp3`) — play якщо live call fails under 30s.
2. T-12h перед demo — manual test call на Glib'ів phone. Запис call duration + quality notes.
3. У `call_preference` для demo brand — можна встановити `"tts"` як primary якщо Telli flaky, зберігаючи voice vibes але через ElevenLabs (more controlled).

**Resolution trigger:** 3 successful test calls на demo day morning.

---

### 1.3 Firecrawl — JS-rendered competitor sites `[DEFERRED — Firecrawl cut, Tavily covers; gap re-applies if Firecrawl reactivated]`

**Status:** DEFERRED. **Severity:** MED (when reactivated). **Owner:** W9 implementation.

**Gap.** Firecrawl за замовчуванням scrape'ить HTML. Competitor sites часто SPA (Twitter/X, many product blogs) — без JS render'у повертається shell. Unclear якщо Firecrawl auto-detects і rendering JS.

**Mitigation:**
1. При W9 implementation — передавати `render_js: true` у Firecrawl args (якщо supported).
2. Fallback chain: Firecrawl → Tavily search (has snippets) → mark signal як `source_quality: "degraded"`.
3. Manually curate competitor list до static-rendered sites для demo (blog.competitor.com, не twitter.com/competitor).

**Resolution trigger:** 5 competitor sources scraped successfully у smoke test.

---

### 1.4 OpenAI / Anthropic — structured output schema drift

**Status:** KNOWN RISK. **Severity:** MED. **Owner:** ongoing.

**Gap.** LLM може повернути valid JSON який Zod'у не підходить (missing field, wrong enum value). AI SDK `generateObject` retries, але не безкінечно — після 3 спроб throws.

**Mitigation:**
1. Each schema має loose fallback: optional fields де можна.
2. Prompt engineering — explicit schema description у system prompt.
3. Log failed Zod parses у `runs.event_payload.validation_errors` для later prompt refinement.
4. Monitor: якщо specific schema fail'иться >10% — адресувати prompt.

**Resolution trigger:** Ongoing quality metric, not one-time close.

---

## 2. Database / Supabase

### 2.1 RLS bypass via service role

**Status:** INHERENT RISK. **Severity:** CRITICAL. **Owner:** discipline.

**Gap.** Inngest functions використовують `SUPABASE_SERVICE_ROLE_KEY` — обходить RLS. Якщо functions писатимуть дані не для correct `organization_id` — data leak між orgs.

**Mitigation:**
1. `lib/supabase/server.ts` має helper `createServerClient({ organization_id })` що додає RLS filter manually (навіть з service role).
2. Всі Inngest INSERT'и мусять explicit'но setti'ти `organization_id`. Grep check у pre-commit: `supabase.from(...).insert({...})` without `organization_id` field → fail.
3. Integration test per function: run з fake `organization_id=X`, verify що new rows мають `organization_id=X` і тільки.
4. Code review gate: CRITICAL zone у `CLAUDE.md §21` включає `lib/supabase/rls/`.

**Resolution trigger:** Linter rule added + test coverage.

---

### 2.2 pgvector index build time

**Status:** OPEN. **Severity:** LOW. **Owner:** post-demo.

**Gap.** Перша HNSW index build на >10k rows може займати хвилини. Якщо додаємо index через migration на live prod — lock на table під час build.

**Mitigation:**
1. Для demo — залишаємось на IVFFlat (fast build).
2. Post-demo: `create index concurrently` для HNSW migration коли дані зростають.
3. У RUNBOOK §3: додати flag "irreversible migrations list" — index rebuilds entered там.

**Resolution trigger:** N/A до post-demo threshold (>10k snapshots).

---

### 2.3 Storage bucket RLS drift

**Status:** OPEN. **Severity:** HIGH. **Owner:** implementation.

**Gap.** Storage bucket RLS (via `storage.objects`) — окремі policies від table RLS. Easy to miss — bucket create'ається, policy не додається, file writable всіма.

**Mitigation:**
1. Migration для bucket create завжди у пакеті з policy insert (один файл).
2. Integration test: try read file з bucket без auth → expect 403.
3. `supabase-db-tests/storage.test.sql` — тригериться у CI.

**Resolution trigger:** Test added.

---

### 2.4 Migration applied on prod but not on local (or vice versa)

**Status:** PROCESS RISK. **Severity:** MED. **Owner:** discipline.

**Gap.** Dev забуває `supabase db push` перед merge. Prod старіший за code.

**Mitigation:**
1. PR template checklist: "Migration applied у prod? ✓/✗".
2. Post-deploy `/api/readyz` перевіряє що expected migration version applied (query `supabase_migrations.schema_migrations`).
3. CI blocks merge якщо `supabase/migrations/` changed і `types.ts` не regenerated.

**Resolution trigger:** CI hook added.

---

## 3. Multi-brand isolation

### 3.1 Public demo data leak

**Status:** KNOWN RISK. **Severity:** CRITICAL. **Owner:** deploy verify.

**Gap.** `"{t}_public_demo"` policy дозволяє SELECT на `organization_id = DEMO_BRAND_ID`. Якщо DEMO_BRAND_ID у env → real brand UUID через typo → real data exposed publicly.

**Mitigation:**
1. `DEMO_BRAND_ID` встановлюється тільки після seed.sql insert — UUID explicit'но hardcoded у seed, не generated.
2. Seed SQL включає `assert` що `is_public_demo = true` для DEMO_BRAND_ID + all real brands `is_public_demo = false`.
3. Policy включає `and organizations.is_public_demo = true` — якщо UUID matches але flag false, no access.
4. Demo day check: open `/demo/<random-UUID>` → expect 404/no data (not accidental leak).

**Resolution trigger:** Double check виконано T-2h перед demo.

---

### 3.2 Session variable `app.demo_brand_id` set incorrectly

**Status:** IMPLEMENTATION GAP. **Severity:** HIGH. **Owner:** middleware implementation.

**Gap.** `current_setting('app.demo_brand_id', true)` relies on session var being set on queries from `/demo/*` and `/widget/*` routes. Якщо missing — `current_setting` returns NULL, policy fails, anon gets no data (soft fail). Якщо set wrong — fails hard.

**Mitigation:**
1. Middleware на `/demo/*` + `/widget/*` sets session variable per request via `set_config('app.demo_brand_id', $1, true)` через Supabase client.
2. If `brand slug → UUID` lookup fails — 404 response, don't fallback до random UUID.
3. Test: integration test з anon client hitting `/demo/{demo_brand}` → get data; hitting `/demo/{private_brand}` → 404.

**Resolution trigger:** Middleware implemented + test.

---

## 4. Inngest / orchestration

### 4.1 Step timeout during Telli webhook wait `[DEFERRED — W6 voice cut]`

**Status:** DEFERRED. **Severity:** MED (when reactivated). **Owner:** W6.

**Gap.** `step.waitForEvent("morning-brief.delivered", { timeout: "5m" })` блокує run на 5 хвилин. Якщо Telli call failed silently (no webhook) — run hangs until timeout, occupying Inngest concurrency slot.

**Mitigation:**
1. Timeout set на 3 min (sufficient для Telli callback SLA, not 5 min).
2. On timeout → fallback до ElevenLabs TTS + notification (не fail run).
3. Monitor metric: % runs з `outcome='failed'` after wait — >20% triggers Telli config review.

**Resolution trigger:** Wait timeout + fallback implemented.

---

### 4.2 Inngest free tier quota

**Status:** HYPOTHESIS. **Severity:** MED. **Owner:** monitor.

**Gap.** Inngest free tier — 50k runs/month. 4 pipelines × 10 active orgs × avg 10 runs/day × 30 = 12k runs/month. Fits, але peak from manual triggers + replays може bump.

**Mitigation:**
1. Monthly review `cost_ledger` + Inngest dashboard.
2. Upgrade до Pro tier коли >70% consumed.
3. Hackathon: demo brand тільки — <1% quota.

**Resolution trigger:** Post-demo, at first >50% monthly.

---

### 4.3 Cron dispatch concurrency

**Status:** IMPLEMENTATION GAP. **Severity:** LOW. **Owner:** W6.

**Gap.** `morning-brief-tick-dispatcher` runs hourly → emits `morning-brief.tick` per org. Якщо 100 orgs mature — simultaneous dispatch, Inngest processes serially але може hit rate limits на OpenAI/Telli.

**Mitigation:**
1. Dispatcher використовує `step.run(`dispatch-${org.id}`, ...)` з невеликим jitter (random 0-60s delay before emit per org).
2. Post-demo: якщо >50 orgs — `throttle` config на individual function.

**Resolution trigger:** Not urgent v1.

---

## 5. UI / frontend

### 5.1 Mobile Safari render on `/demo`

**Status:** OPEN. **Severity:** HIGH. **Owner:** pre-demo test.

**Gap.** Demo journey starts з журі клікаючим URL на iPhone. Tailwind config може мати responsive holes. shadcn/ui components mostly mobile-friendly але custom widgets — не.

**Mitigation:**
1. Mobile-first responsive classes на `/demo/*` pages (`sm:` prefix для >sm, not default).
2. Manual QA на real iPhone Safari T-12h перед demo.
3. Fallback: pre-recorded screen video of demo flow якщо live mobile fails.

**Resolution trigger:** iPhone test passes.

---

### 5.2 Iframe CSP / X-Frame-Options `[DEFERRED — W4 widget cut]`

**Status:** DEFERRED. **Severity:** HIGH (when reactivated). **Owner:** W4.

**Gap.** `/widget/{brand}` має embed'атись у external sites через `<iframe>`. Default Next.js sets `X-Frame-Options: DENY`. Потрібно override.

**Mitigation:**
1. `middleware.ts` detect'ить `/widget/*` path і видаляє `X-Frame-Options` header + set'ить `Content-Security-Policy: frame-ancestors *`.
2. Для security-conscious deployments post-demo — allowlist specific domains через org settings.
3. Test: real `<iframe src=".../widget/demo">` у test HTML on CodePen чи JSFiddle → renders.

**Resolution trigger:** Middleware + test.

---

### 5.3 Real-time updates (counter-draft appears mid-demo)

**Status:** OPEN. **Severity:** MED. **Owner:** W9 + dashboard.

**Gap.** Demo flow: trigger W9 manually → expect draft appears у dashboard. Default Next.js SSR не updates без full reload. Якщо користувач не refresh'ує — draft не показує.

**Mitigation:**
1. Use `revalidateTag` у W9 final step → clients з subscribed tag force-refresh.
2. Dashboard client component має `useRouter().refresh()` button або 10s poll.
3. Optional post-demo: Supabase real-time subscription на `counter_drafts` inserts.

**Resolution trigger:** Polling implemented (simplest).

---

## 6. Brand voice / content quality

### 6.1 Counter-draft tone inconsistency

**Status:** ONGOING. **Severity:** MED. **Owner:** W9 prompt engineering.

**Gap.** LLM generates counter-draft у `tone_pillar` field — але actual body прagmatic. Ніколи не достатньо тестовано що LLM дійсно respects tone pillars з brand guide.

**Mitigation:**
1. `knowledge/brand-voice/*` — brand tone guidelines, read'яться у W9 `generate-counter-draft` step.
2. Human review mandatory — `status='draft'` за замовчуванням (див. `knowledge/competitive-intel/rules.md`).
3. Track rejection reason у `counter_drafts.reviewed_at` + future column `rejection_reason` для prompt tuning.

**Resolution trigger:** ≤10% rejection rate з tone-related reasons у продовженні.

---

### 6.2 Competitor PII in signals

**Status:** GUARDRAIL. **Severity:** HIGH (legal). **Owner:** W9 prompt.

**Gap.** Tavily/Firecrawl scrape може зачепити tweet з reply to employee. Signal summary може містити names. Правило — тільки публічні handles/URLs.

**Mitigation:**
1. Explicit у signal generation prompt: "Do NOT include personal names беside public brand handles (@handles)".
2. Post-generation regex filter: blacklist common name patterns (First Last format ≠ @handle).
3. Human audit у counter_draft review — якщо PII leak'нуло у body, rejection.

**Resolution trigger:** Prompt enforced + blacklist regex.

---

## 7. Cost / budget

### 7.1 Runaway LLM cost

**Status:** KNOWN RISK. **Severity:** HIGH. **Owner:** discipline.

**Gap.** Inngest retries 3× by default. Якщо step.run wraps LLM call з bad prompt → 3× calls × all input tokens. Bug у loop may cost $100+ фаст.

**Mitigation:**
1. `cost_ledger` insert після КОЖНОГО LLM call, з `run_id` FK.
2. `check-budget` step на початку expensive pipelines — queries cost last 24h per org, aborts if >$1/day/brand (demo) or configured threshold (real).
3. Hard monthly budget у OpenAI/Anthropic dashboards — $50 limit.
4. Alert: Sentry або similar — якщо `cost_ledger` single-run >$0.50 — fires.

**Resolution trigger:** Budget check step implemented.

---

### 7.2 Telli per-minute billing spike `[DEFERRED — W6 voice cut]`

**Status:** DEFERRED. **Severity:** MED (when reactivated). **Owner:** W6.

**Gap.** Telli ~$0.08/min. Long brief + user engagement на call → 5-min call = $0.40. За 10 brands × 30 days = $120/month.

**Mitigation:**
1. `MorningBriefSchema.text ≤ 1400 chars` enforce — ~2 min speaking.
2. Post-call duration check: якщо >3 min — log warn, review prompt length trend.
3. Dashboard для кожного org — per-day cost breakdown.

**Resolution trigger:** Duration cap monitored.

---

## 8. Demo-specific gaps

### 8.1 Live Telli call fails during demo `[DEFERRED — W6 voice not in demo]`

**Status:** N/A FOR HACKATHON (W6 voice cut, demo uses W6′ Slack send instead). Pre-recorded audio fallback no longer needed. **Severity:** N/A.

**Mitigation:** Pre-recorded audio fallback (див. RUNBOOK §7 T-12h).

**Resolution trigger:** Audio recorded.

---

### 8.2 Wifi fails during demo

**Status:** MITIGATED. **Severity:** HIGH. **Owner:** physical.

**Mitigation:** Phone hotspot tethered. Also — screen-recorded full demo flow, can play as video fallback.

**Resolution trigger:** Hotspot tested.

---

### 8.3 Supabase region latency від hackathon location

**Status:** UNKNOWN. **Severity:** LOW. **Owner:** pre-demo.

**Gap.** Supabase у eu-west-1. Hackathon location невідома — якщо US, latency +100ms.

**Mitigation:** Demo routes heavy на SSR, not client fetch — latency compound'иться раз per page load, not per interaction. Acceptable.

**Resolution trigger:** On-site measurement.

---

## 9. Documentation / knowledge drift

### 9.1 `knowledge/` vs `brand-intel/` divergence

**Status:** ONGOING. **Severity:** LOW (robustness). **Owner:** discipline.

**Gap.** `knowledge/` оновлюється дрібно, `brand-intel/` — батчем. Може drift'ити.

**Mitigation:**
1. `CLAUDE.md §22` встановлює precedence: brand-intel виграє, knowledge updates.
2. Weekly reflection (CLAUDE.md Block D) — включає grep для "superseded" терміна.
3. Pre-commit check: якщо `brand-intel/*.md` changed і `knowledge/INDEX.md` untouched >2 weeks — warn.

**Resolution trigger:** Consolidation cadence kept.

---

### 9.2 ADR references за number (ADR-001 vs filename)

**Status:** KNOWN. **Severity:** LOW.

**Gap.** ADRs у `decisions/` files з date'prefix, але тіло може ссылатися як "ADR-001". Supersede'и confuse numbering.

**Mitigation:**
1. Не використовуй "ADR-N" у prose — посилання на filename: `decisions/2026-04-24-deployment-webapp.md`.
2. `decisions/README.md` має explicit mapping (ADR-001-R → filename, etc.) як audit trail.

**Resolution trigger:** Convention followed.

---

## 10. Open questions (no resolution yet)

- **Post-demo billing.** Чи переходимо на Supabase Pro + Inngest Pro одразу або чекаємо traction? $25 + $20 monthly baseline.
- **Multi-tenant admin UI.** Хто реєструє бренди? MVP — manual Supabase dashboard create; scalable — self-serve. Deferred.
- **Webhook retry idempotency.** Telli retries callbacks — чи робимо dedup на `call_id`? Зараз — не робимо, може призвести до duplicate `voice_call_results` rows.
- **Embedding model switch.** `text-embedding-3-small` 1536 dim — optimal? Post-demo можна evaluate `3-large` 3072 dim, але migration потребує re-embedding всіх існуючих rows.
- **GDPR DSR.** Right-to-erasure — cascade delete на `organizations` покриває більшість, але що з Storage bucket files (audio recordings)? Need explicit cleanup у `before delete` trigger або periodic sweep.

---

## 11. Cross-references

- Failure modes per-pipeline → `PIPELINES.md §failure modes`.
- Incident response procedure → `RUNBOOK.md §6`.
- Budget / cost design → `ARCHITECTURE.md §4 + CONTRACTS.md §3 cost_ledger`.
- Known hypotheses (domain-specific) → `knowledge/*/hypotheses.md`.
- Historical plugin-era gaps → `_archive/GAPS.md` (superseded, reference only).
