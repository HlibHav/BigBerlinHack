# Runbook

> Operational procedures. Deploy, migrations, key rotation, rollback, incident response, demo-day checklist. Коли щось горить — читаєш з початку, шукаєш релевантний розділ, виконуєш крок за кроком.

**Version:** 2026-04-24. Оновлюється після кожного incident'у у §6.

---

## 0. Principles

- **Never deploy blind.** Перед prod merge — preview deploy + smoke test на preview URL.
- **Migrations — okремий step.** Не міксуй migration і code change у одному PR. Migration перший, код другий.
- **Rollback-ready.** Кожна migration має inverse у documented формі (або у сусідньому файлі, або у тексті RUNBOOK). Якщо "irreversible" — flag'уй у PR опис.
- **Secrets rotation — як тільки помітив leak.** Не "через годину", не "завтра". Одразу.
- **Demo day — frozen mode.** Від 24 год перед hackathon (2026-04-24 20:00 UTC+3) — no merges окрім critical fixes. Див. §7.

---

## 1. Initial setup (new environment)

### 1.1 Prerequisites

- Node.js 20 LTS (`nvm install 20 && nvm use 20`).
- pnpm 9+ (`npm install -g pnpm@9`).
- Supabase CLI 1.150+ (`brew install supabase/tap/supabase`).
- Vercel CLI (`pnpm install -g vercel@latest`).
- Inngest CLI (`pnpm dlx inngest-cli@latest --version`).

### 1.2 Clone + install

```bash
git clone git@github.com:HlibHav/BigBerlinHack.git
cd bbh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill .env.local з real secrets (див. §5)
```

### 1.3 Supabase link

```bash
supabase login
supabase link --project-ref <PROJECT_REF>    # з Supabase dashboard
supabase db pull                              # sync current schema state
pnpm types:gen                                # generate lib/supabase/types.ts
```

### 1.4 Local run

```bash
supabase start                   # local Postgres on :54322
supabase db reset                # apply migrations + seed
pnpm dev                         # Next.js on :3000
pnpm dlx inngest-cli dev         # Inngest dashboard on :8288
```

Open `http://localhost:3000/demo/attio` (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`) — має render'итись без console errors.

---

## 1.5 Peec snapshot refresh

Per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`, Peec accessed через MCP browser OAuth у Claude Code session, не через server-side REST. Data persisted у `data/peec-snapshot.json` (committed у git, не secret).

**Setup (одноразово):**

1. У Claude Code config (`~/.claude.json` або через `/mcp` slash command), додай Peec MCP server:
   ```
   peec → https://api.peec.ai/mcp
   ```
2. Restart Claude Code session — браузер відкриє Peec OAuth → дай consent.
3. Verify: у новій сесії call `mcp__peec__list_projects` має повернути ≥1 project (Attio test).

**Refresh workflow (running):**

```
У Claude Code session у репо:
> refresh peec snapshot
```

Я виконаю script `scripts/_peec-pull.ts` що:
- `mcp__peec__list_projects` → знаходжу Attio test project
- `mcp__peec__list_brands(project_id)` → 3 brands
- `mcp__peec__get_brand_report(project_id, start=7d ago, end=today)` → brand reports з visibility/sentiment/position
- `mcp__peec__list_chats(project_id, last 7d)` → top chats
- `mcp__peec__get_chat per top 10` → evidence_refs source
- `mcp__peec__get_url_report` → cited URLs
- `mcp__peec__get_actions(scope='owned')` → recommendations
- Compile у `data/peec-snapshot.json`, overwrite, git commit

**Cadence:** перед demo (T-2h), потім on-demand. Production cadence (post-hackathon) — TBD коли вирішується paid REST API access.

**Якщо Peec MCP unavailable** (не реєстрований у Glib's account, або MCP Challenge over):
- Fallback: hand-craft realistic fixture у `data/peec-snapshot.json` based на public Attio/Salesforce/HubSpot info via Tavily search.
- Schema must validate проти `PeecSnapshotFileSchema` (CONTRACTS §6.1) інакше W9 fail'ить parse.

---

## 2. Deploy procedure

### 2.1 Preview deploy (on PR)

Auto via Vercel Git integration — кожен push на branch → preview URL у PR checks. Ніяких manual actions.

**Smoke test на preview:**
1. Відкрий preview URL.
2. Navigate: `/demo/attio` (hackathon). `/widget/attio` `[DEFERRED — W4 cut]`.
3. Console має бути чиста (open DevTools).
4. Якщо touch'ав Inngest functions — `curl -X POST $PREVIEW_URL/api/inngest` має return'ити 200 з list of registered functions.

### 2.2 Production deploy (merge to main)

```bash
git checkout main
git pull
# verify local green:
pnpm typecheck && pnpm lint && pnpm test

# якщо migration у PR:
supabase db push                 # applies migration to linked prod Supabase

# merge:
git merge feat/xxx --ff-only     # або via GitHub UI (squash)
git push origin main
# Vercel auto-deploys prod
```

### 2.3 Post-deploy verify

```bash
curl https://bbh.vercel.app/api/healthz    # → {ok: true}
curl https://bbh.vercel.app/api/readyz     # → {supabase: "ok", inngest: "ok"}
```

Inngest dashboard (`https://app.inngest.com/env/production/apps`) — has'ло, перевір що app `bbh` показує "in-sync" з deploy commit SHA.

---

## 3. Migrations

### 3.1 Create new migration

```bash
supabase migration new add_voice_phone_column
# → creates supabase/migrations/<timestamp>_add_voice_phone_column.sql
```

Пиши DDL у цьому файлі. Дотримуйся правил з `CONTRACTS.md §3`:
- Обов'язкові колонки (`id`, `organization_id`, `created_at`).
- RLS policies pair (org_isolation + public_demo).
- Constraints (array length checks, NOT NULL, FK cascades).

### 3.2 Test locally

```bash
supabase db reset    # wipes + applies all migrations + seed
pnpm types:gen       # regen TS types
pnpm typecheck       # catches schema drift
```

Якщо typecheck fail — твоя Zod schemas або queries посилаються на old columns. Онови їх у тому ж PR.

### 3.3 Apply to production

```bash
supabase db push
# запитає confirm перед DDL
```

Якщо DDL застосована тільки частково (наприклад, падіння посередині через duplicate key) — див. §6 Rollback.

### 3.4 Rollback procedure

Supabase CLI не має built-in rollback. Manual approach:

1. Створи **reverse migration**: `supabase migration new rollback_{original_name}`.
2. Напиши inverse DDL: `drop column`, `drop table`, `alter type ... drop value` (Postgres supports з 14+).
3. Apply: `supabase db push`.
4. Regen types.

**Irreversible cases** (flag у PR опис):
- `drop column` з daty — data loss без backup.
- `alter type ... drop value` якщо existing rows мають це value.
- Foreign key cascade delete якщо parent rows deleted.

Для всіх irreversible: **export dependent data перед apply**. `supabase db dump --data-only -t <table> > backup.sql`.

---

## 4. Inngest operations

### 4.1 Deploy functions

Auto з Vercel deploy. Endpoint `/api/inngest` синхронізується з Inngest cloud при кожному deploy.

### 4.2 Trigger function manually

**Via Inngest dashboard:**
1. `app.inngest.com` → `bbh` → Functions.
2. Click function → "Invoke".
3. Paste event payload (schema з `CONTRACTS.md §1`).
4. Watch step trace.

**Via CLI:**

```bash
curl -X POST https://bbh.vercel.app/api/inngest \
  -H "Content-Type: application/json" \
  -H "X-Inngest-Signature: ..." \
  -d '{"name":"morning-brief.tick","data":{...}}'
```

У production рідко потрібно — dashboard простіший.

### 4.3 Debug failed run

1. Dashboard → Runs → filter by `status=failed`.
2. Click run → step trace.
3. Failed step show'ить error message + full input/output.
4. Якщо retry'ї вичерпані → click "Replay" після fix.

### 4.4 Pause / resume function

Dashboard → Functions → click function → "Pause". Useful коли знайшли bug який пише bad data — pause до fix + replay.

---

## 5. Secrets & key rotation

### 5.1 Secrets inventory

| Key | Location | Used by | Rotation cadence |
|-----|----------|---------|------------------|
| `SUPABASE_URL` | Vercel env + `.env.local` | Next.js + Inngest functions | Never (project identifier) |
| `SUPABASE_ANON_KEY` | Vercel env + `.env.local` | Browser client | On leak |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env (server-only) | Inngest functions, server actions | On leak / quarterly |
| `INNGEST_SIGNING_KEY` | Vercel env | `/api/inngest` verification | On leak |
| `INNGEST_EVENT_KEY` | Vercel env | Emitting events | On leak |
| `OPENAI_API_KEY` | Vercel env | LLM + embeddings | Monthly |
| `ANTHROPIC_API_KEY` | Vercel env | LLM (reasoning) | Monthly |
| `PEEC_SNAPSHOT_PATH` | Vercel env (`./data/peec-snapshot.json`) | W9 reads JSON file (per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`) | Never (path, not secret) |
| `TAVILY_API_KEY` | Vercel env | Tavily search API | Monthly |
| `SLACK_WEBHOOK_URL` | Vercel env | W6′ morning brief delivery | On leak |
| `DEMO_BRAND_ID` | Vercel env + `.env.local` | Public demo RLS (Attio UUID) | Never (seed'иться у DB) |
| `DEMO_BRAND_SLUG` | Vercel env + `.env.local` | URL slug (`attio`) | Never |
| `FIRECRAWL_API_KEY` | Vercel env | Firecrawl MCP | `[DEFERRED — Tavily covers]` |
| `TELLI_API_KEY` | Vercel env | Outbound calls | `[DEFERRED — W6 voice cut]` |
| `TELLI_WEBHOOK_SECRET` | Vercel env | HMAC verify | `[DEFERRED — W6 voice cut]` |
| `ELEVENLABS_API_KEY` | Vercel env | TTS fallback | `[DEFERRED — W6 voice cut]` |
| `RESEND_API_KEY` | Vercel env | Email delivery | `[DEFERRED — Slack-only sufficient]` |

### 5.2 Rotate on leak

1. Revoke old key у provider dashboard (Supabase/OpenAI/Telli/etc.).
2. Generate new key.
3. Update у Vercel dashboard `Settings → Environment Variables`.
4. Redeploy production (`vercel --prod` або trigger через git commit).
5. Update local `.env.local` якщо використовуєш той самий ключ.
6. Якщо leaked у git commit → `git-filter-repo` на repo + `git push --force` (уважно! узгодь з team) + rotate.

### 5.3 Environment variable changes

Додаючи нову env var:
1. Update `.env.example` (commit).
2. Update Vercel dashboard для prod + preview environments.
3. Update `CONTRACTS.md §5.1 Secrets inventory` (якщо це новий secret).
4. Update `RUNBOOK.md §5.1 Secrets inventory`.
5. Якщо потрібна local dev — update `.env.local` (не commit).

---

## 6. Incident response

### 6.1 Severity levels

- **SEV-1:** prod unavailable — demo URL не render'иться, або main pipeline fully broken. Response: immediate, drop everything.
- **SEV-2:** degraded — один pipeline fail'ить (решта ок), або UI bug у dashboard. Response: within 1h.
- **SEV-3:** minor — log warning, non-blocking issue. Response: next work session.

### 6.2 SEV-1 response playbook

1. **Confirm.** Open `https://bbh.vercel.app/demo/attio` + incognito. If fails → SEV-1 confirmed.
2. **Check Vercel deployments.** `vercel ls` — чи recent deploy broken? Якщо так — `vercel rollback <URL>` до попереднього known-good.
3. **Check Supabase status.** `status.supabase.com` — чи їхній incident? Якщо так — wait, communicate.
4. **Check Inngest status.** `status.inngest.com` — similar.
5. **Check logs:**
   ```bash
   vercel logs https://bbh.vercel.app --follow
   ```
   Або Vercel dashboard → Deployments → logs.
6. **Identify root cause.** Most common: env var missing, migration not applied, external API down.
7. **Fix + redeploy.** Якщо deploy fix — regular procedure. Якщо config fix — update env + `vercel --prod`.
8. **Post-incident.** Log у `knowledge/hackathon-demo/knowledge.md` (hackathon-specific) або `brand-intel/GAPS.md` (general) з timestamp + root cause + fix.

### 6.3 Common incidents

**"migration applied on prod but types not regenerated"** — TypeScript errors у new deploy.
- Fix: `pnpm types:gen` локально, commit, push.
- Prevention: add types regen до CI (post-migration step).

**"Inngest function deployed but cron not firing"** — schedule not synced.
- Fix: Inngest dashboard → Functions → click → "Re-sync". Or trigger deploy hook.
- Prevention: post-deploy healthcheck включає Inngest function listing.

**"Telli webhook returns 401 на prod"** `[DEFERRED — W6 voice cut, applies post-hackathon reactivation]` — signature mismatch.
- Fix: перевір `TELLI_WEBHOOK_SECRET` у Vercel vs Telli dashboard.
- Prevention: signed deploy tag — rotate webhook secret rarely, tested on preview first.

**"Slack webhook returns 4xx у W6′"** — invalid SLACK_WEBHOOK_URL or workspace removed integration.
- Fix: regenerate incoming webhook у Slack workspace settings → update Vercel env var → redeploy.
- Prevention: T-2h checklist verifies Slack post via curl before demo.

**"Demo brand показує "no data"** — seed.sql не застосований після `supabase db reset`.
- Fix: `supabase db reset` повторно, або manually `psql -f supabase/seed.sql`.
- Prevention: demo-day checklist §7 включає seed verify.

**"Cost exceeds budget — alert fires"** — runaway retries або LLM loop.
- Fix: Inngest dashboard → pause failing function → investigate.
- Prevention: `check-budget` step у W6, per-function retry cap, log-cost every call.

### 6.4 Postmortem template

Створи `knowledge/hackathon-demo/knowledge.md` запис (або новий `incidents/YYYY-MM-DD-{slug}.md` post-demo):

```markdown
## Incident YYYY-MM-DD HH:MM — {one-line summary}

**Severity:** SEV-1/2/3.
**Duration:** X min.
**Impact:** {what users saw}.

**Timeline:**
- HH:MM — detected via {alert/manual/user report}.
- HH:MM — root cause identified: {X}.
- HH:MM — fix applied.
- HH:MM — verified recovery.

**Root cause:** {technical summary}.

**Fix:** {what was changed + commit SHA + migration if any}.

**Prevention:** {monitoring/test/process change — actionable, not "be more careful"}.
```

---

## 7. Demo-day checklist (hackathon 2026-04-25)

**T-24h (2026-04-24 10:00 local):**
- [ ] Freeze merges окрім SEV-1 fixes. Announce у team chat.
- [ ] Run full `supabase db reset` на prod → seed Attio demo brand.
- [ ] Refresh `data/peec-snapshot.json` via Claude Code MCP session (per §1.5).
- [ ] Trigger W9 run manually для Attio → verify fresh signals + counter-drafts.
- [ ] Backup current prod Supabase: `supabase db dump > prod-backup-20260424.sql`.
- [ ] Verify all env vars у Vercel prod (особливо `DEMO_BRAND_ID=00000000-0000-0000-0000-00000000a771`, `DEMO_BRAND_SLUG=attio`, `SLACK_WEBHOOK_URL`).

**T-12h (2026-04-24 22:00):**
- [ ] Verify Slack incoming webhook URL works — test post via curl.
- [ ] Re-pull Peec snapshot if data drift expected.
- [ ] Check W9 + W5 + W7 + W6′ last manual runs `ok: true`.
- [ ] Mobile Safari check — open `/demo/attio` на iPhone. Fix будь-які layout issues.

**T-2h (demo day morning):**
- [ ] Final Peec snapshot refresh via Claude Code MCP session.
- [ ] Full demo wall-time run-through — ≤4 хв, repeated 3 рази. Fix timing issues.
- [ ] Trigger W6′ "Send today's brief now" — verify Slack message arrives.
- [ ] Pin demo browser tabs (`/demo/attio` dashboard, Inngest UI for live trigger, Slack channel).
- [ ] Screenshot everything — у випадку outage during demo, show screenshots.

**T-0 (demo):**
- [ ] Open `/demo/attio` + Inngest UI + Slack у split screen.
- [ ] Start з 1-sentence pitch ("BBH = intelligence layer над Peec MCP").
- [ ] Live trigger "Run radar now" → watch Inngest trace → new signal + counter-draft.
- [ ] Approve counter-draft → W7 auto-spawns → 4 channel variants render.
- [ ] Click "Send today's brief now" → real Slack post → show jury Slack.

**T+0 (post-demo):**
- [ ] Don't touch prod. Unfreeze merges наступного дня.
- [ ] Schedule retro: `decisions/2026-04-26-post-hackathon-retro.md`.

---

## 8. Routine operations

### 8.1 Daily (automated, post-hackathon)

- Inngest crons (post-hackathon): W6′ daily 8am UTC (Slack send), W9 every 2h. Hackathon — manual triggers only.
- Supabase backups (Pro tier) — daily.
- Vercel analytics email — daily digest.

### 8.2 Weekly manual (post-demo)

- Review `cost_ledger` aggregates — are per-brand costs within envelope?
- Check `runs` table: failure rate per function. If >5% over week — investigate.
- `knowledge/*/hypotheses.md` review — що promot'ити, що видалити.

### 8.3 Monthly

- Rotate rate-limited API keys (OpenAI, Anthropic, Tavily). Firecrawl/ElevenLabs — `[DEFERRED]`.
- Supabase usage audit — наближаємось до free tier limits?
- Cleanup old runs: `delete from runs where created_at < now() - interval '30 days' and ok = true;`.

---

## 9. Disaster recovery

### 9.1 Supabase data loss

1. Restore from latest backup: Supabase dashboard → Database → Backups → Restore.
2. If free tier (no backups) → re-seed demo brand: `supabase db reset` з `seed.sql`. Real org data — gone.
3. Post-incident: move до Pro tier для real brands.

### 9.2 Vercel project deleted

1. Re-create у Vercel dashboard → Import з `git@github.com:HlibHav/BigBerlinHack.git`.
2. Re-add all env vars (reference `CONTRACTS.md §5`).
3. Link domain `bbh.vercel.app` (auto-assigned) + custom domain якщо є.
4. Redeploy: push tag або empty commit.

### 9.3 Inngest app desync

1. Inngest dashboard → Apps → `bbh` → check last sync SHA.
2. Force sync: `curl -X PUT https://bbh.vercel.app/api/inngest`.
3. Verify functions registered.

---

## 10. Cross-references

- Environment setup CLI details → `CLI-TOOLS.md`.
- Code-level contracts → `CONTRACTS.md`.
- Pipeline-specific failure modes → `PIPELINES.md §failure modes`.
- Known gaps that incidents might stem from → `GAPS.md`.
- Architectural context for deploy topology → `ARCHITECTURE.md §9`.
