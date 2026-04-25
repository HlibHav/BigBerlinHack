# CLI tools

> Cheatsheet для щоденної роботи. Спочатку — що встановити (§1). Далі pnpm / supabase / vercel / inngest / git — з прикладами релевантними саме до BBH. Коли забув команду — сюди.

**Version:** 2026-04-24 (rev. install prereqs).

---

## 0. Quick reference

```bash
# Local dev (3 terminals)
supabase start                           # Postgres + Auth + Storage на :54321/:54322
pnpm dev                                 # Next.js на :3000
pnpm dlx inngest-cli@latest dev          # Inngest dashboard на :8288

# Fresh local state
supabase db reset                        # wipe + migrations + seed

# Validate before push
pnpm typecheck && pnpm lint && pnpm test

# Ship
git push origin HEAD                     # → Vercel preview deploy
git checkout main && git merge --ff-only feat/xxx && git push
```

---

## 1. Install prerequisites

Перелік калібрований саме під BBH stack. Не "все що теоретично корисно", а "без цього — дев-флоу ламається".

### 1.1 Required (hard dependency)

| Tool | Version | Install (macOS) | Навіщо для BBH |
|------|---------|-----------------|----------------|
| Node.js | 20 LTS | `brew install node@20` або `fnm install 20` | runtime Next.js + Inngest (Vercel default) |
| pnpm | 9+ | `npm install -g pnpm@9` | package manager, lockfile discipline |
| git | ≥2.40 | `brew install git` | SCM, `git-filter-repo` для secret recovery |
| Docker Desktop | latest | `brew install --cask docker` | backing store для `supabase start` local stack |
| Supabase CLI | 1.150+ | `brew install supabase/tap/supabase` | migrations, types gen, local Postgres+Auth+Storage |
| Vercel CLI | latest | `pnpm add -g vercel` | preview/prod deploys, `env pull`, logs |
| Inngest CLI | latest | `pnpm dlx inngest-cli@latest dev` (без global install) | local dashboard на :8288 |
| psql (libpq) | 15+ | `brew install libpq` + `brew link --force libpq` | direct DB access для audit queries (RLS bypass via service role) |

**Bootstrap one-liner на свіжій машині (macOS):**

```bash
brew install node@20 pnpm git supabase/tap/supabase libpq
brew install --cask docker
pnpm add -g vercel
brew link --force libpq      # щоб psql був у PATH
```

Linux/WSL: те саме через `apt` / `nix` / офіційні releases — див. Supabase і Vercel docs.

### 1.2 Recommended (productivity)

Не блокують дев, але економлять час щодня.

| Tool | Install | Навіщо для BBH |
|------|---------|----------------|
| `jq` | `brew install jq` | парсинг JSON з webhook payloads, `supabase db dump --json`, Inngest API debug, MCP responses |
| `yq` | `brew install yq` | читати/патчити `supabase/config.toml`, GitHub Actions workflows, не зламавши whitespace |
| `ripgrep` (`rg`) | `brew install ripgrep` | швидкий grep по `knowledge/`, `decisions/`, `brand-intel/`, кодбазі — в рази швидше ніж `grep -r` |
| `direnv` | `brew install direnv` + shell hook | auto-load `.env.local` при `cd PROJECTS/BBH` — ні `export`, ні забуті vars |
| `httpie` | `brew install httpie` | читабельна заміна curl для manual Inngest event sends і webhook тестів: `http POST :8288/e/test-key name=morning-brief.tick data:='{...}'` |
| `ffmpeg` | `brew install ffmpeg` | `[DEFERRED W6 voice cut]` конвертація Telli call recordings (wav↔mp3↔m4a), нарізка demo fallback audio у `public/demo-fixtures/`. Не потрібно для hackathon. |
| `duckdb` | `brew install duckdb` | ad-hoc аналітика на export'ах `cost_ledger`, `runs`, `signals` без psql ceremony: `duckdb -c "from read_csv('runs.csv') select ..."` |
| `gh` (GitHub CLI) | `brew install gh` → `gh auth login` | PR management, workflow runs, releases, `gh run watch` для CI — швидше ніж браузер |

### 1.3 Skip (не потрібні для BBH)

| Tool | Чому skip |
|------|-----------|
| `bats` | Ми не ship'имо bash скрипти. Покриття через vitest (unit/integration) + Playwright (E2E). |
| `openssl` CLI | HMAC signature verification живе у коді (`crypto.createHmac` у webhook route handlers), не потрібен CLI handshake. |
| `awscli` / `s3cmd` | Supabase Storage через `@supabase/supabase-js` і `supabase storage` CLI, прямого S3 доступу немає. |
| Global `typescript` / `eslint` | Встановлюються через pnpm як devDep у проєкті. Global install = drift з CI. |
| `deno` / `bun` | Runtime зафіксований на Node 20 (Vercel + Inngest). Альтернативи вносять drift без користі у v1. |

### 1.4 Verification

```bash
node -v          # v20.x
pnpm -v          # 9.x
supabase -v      # 1.150+
vercel -V        # latest (prints version)
psql --version   # psql 15+
jq --version     # jq-1.7+
rg --version     # ripgrep 14+
gh --version     # gh 2.x
docker info      # daemon responsive

# sanity: Supabase local stack boots
supabase start
supabase status  # expect: API :54321, DB :54322, Studio :54323
supabase stop
```

Якщо щось з Required не проходить — не переходь до §2+. Виправ спочатку.

### 1.5 Shell integration

```bash
# direnv (add to ~/.zshrc or ~/.bashrc)
eval "$(direnv hook zsh)"

# pnpm completions
pnpm install-completion

# gh auth (one-time)
gh auth login        # GitHub.com → HTTPS → browser

# supabase login (one-time)
supabase login
```

**`.envrc` у корені проєкту (для direnv):**

```bash
# Після створення .env.local:
echo 'dotenv .env.local' > .envrc
direnv allow
```

---

## 2. pnpm

### 2.1 Base commands

```bash
pnpm install --frozen-lockfile          # CI / after clone
pnpm install <pkg>                      # add dep
pnpm install -D <pkg>                   # add dev dep
pnpm install -E <pkg>                   # pin exact version (для critical deps)
pnpm remove <pkg>

pnpm dev                                # next dev
pnpm build                              # next build
pnpm start                              # next start (for prod-like local)

pnpm typecheck                          # tsc --noEmit
pnpm lint                               # eslint .
pnpm lint --fix
pnpm test                               # vitest run
pnpm test:watch                         # vitest
pnpm test:e2e                           # playwright test
pnpm test <pattern>                     # pnpm test counter-draft
```

### 2.2 Workspace shortcuts (scripts у package.json)

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | production build (local sanity) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | eslint + prettier check |
| `pnpm test` | vitest run |
| `pnpm test:watch` | vitest watch mode |
| `pnpm test:e2e` | playwright run |
| `pnpm types:gen` | `supabase gen types typescript --linked > lib/supabase/types.ts` |
| `pnpm inngest:dev` | `inngest-cli dev` (wrapper) |

### 2.3 Dep management rules

- **Pinning.** Pinуй exact version для: `zod`, `@supabase/*`, `inngest`, `next`. Drift у schemas — real pain.
- **Upgrades.** `pnpm update --interactive --latest` monthly, з повним test run після.
- **Peer deps warnings.** Читай, не ignor'уй. Usually ≥1 — real drift.

### 2.4 Troubleshooting

- `pnpm: command not found` → `npm install -g pnpm@9`.
- `ELIFECYCLE` error у install → `rm -rf node_modules pnpm-lock.yaml && pnpm install`.
- TypeScript version mismatch → перевір `"typescript"` version у root package.json, align з CI.

---

## 3. Supabase CLI

### 3.1 Init / link

```bash
supabase login                           # opens browser
supabase link --project-ref <REF>        # з project settings → API → Project URL (slug part)
supabase status                          # показує local services
supabase start                           # start local stack
supabase stop                            # stop local stack
```

### 3.2 Migrations

```bash
supabase migration new <name>            # creates supabase/migrations/<timestamp>_<name>.sql
supabase db reset                        # LOCAL: wipe + all migrations + seed
supabase db push                         # PROD: apply new migrations (asks confirm)
supabase db pull                         # PROD → LOCAL: sync schema if змінили у dashboard
supabase migration list                  # list + status (applied/pending)
```

**Rule:** ніколи `db pull` не replace'уй `migrations/` ручно — тягни через нові migration files.

### 3.3 Types regen

```bash
supabase gen types typescript --linked > lib/supabase/types.ts
# або alias:
pnpm types:gen
```

Запускай після КОЖНОЇ migration. Commit regenerated file.

### 3.4 SQL access

```bash
# local
supabase db -- psql
\dt public.*                             # list tables
\d+ public.signals                       # describe table
select count(*) from signals;

# або прямий psql (коли libpq встановлений):
psql postgresql://postgres:postgres@localhost:54322/postgres

# production (через linked project)
# НЕ через Supabase CLI — використай dashboard SQL editor для audit'у,
# або connection string з dashboard + psql direct.
```

### 3.5 Storage CLI

```bash
supabase storage ls counter-drafts
supabase storage cp local.md ss:///counter-drafts/<org_id>/file.md
supabase storage rm ss:///counter-drafts/<org_id>/file.md
```

### 3.6 Secrets

```bash
supabase secrets list                    # env vars у Edge Functions (не використовуємо у v1)
supabase secrets set KEY=value
```

---

## 4. Vercel CLI

### 4.1 Project link

```bash
vercel login
vercel link                              # link repo → existing Vercel project `bbh`
vercel env pull .env.local               # pull prod env vars (careful — contains secrets)
```

### 4.2 Deploy

```bash
vercel                                   # preview deploy (returns URL)
vercel --prod                            # production deploy
vercel rollback <deployment-url>         # rollback prod to specific deployment
vercel ls                                # list recent deployments
vercel inspect <url>                     # detailed deploy info
```

### 4.3 Logs

```bash
vercel logs https://bbh-brown.vercel.app --follow    # tail prod logs
vercel logs https://bbh-brown.vercel.app --since 1h  # last hour
vercel logs <preview-url>                       # preview deploy logs
```

Або dashboard → Deployments → click deploy → Logs tab.

### 4.4 Env vars

```bash
vercel env ls                            # list current env vars per environment
vercel env add KEY production            # add (interactive — paste value)
vercel env rm KEY production             # remove
vercel env pull .env.local               # pull to local (overwrites!)
```

**Rule:** не зберігай prod service-role key у `.env.local` без потреби. Для local dev — local Supabase service role (з `supabase status` output).

---

## 5. Inngest CLI

### 5.1 Local dev

```bash
pnpm dlx inngest-cli@latest dev
# або якщо aliased у package.json:
pnpm inngest:dev
```

Opens dashboard на `http://localhost:8288`. Auto-discovers `/api/inngest` endpoint на `localhost:3000`.

### 5.2 Manually send event

Dashboard → Events → "Send event" → paste JSON. Or via HTTP (httpie читабельніше):

```bash
# curl
curl -X POST http://localhost:8288/e/test-key \
  -H "Content-Type: application/json" \
  -d '{
    "name": "morning-brief.tick",
    "data": {
      "organization_id": "<UUID>",
      "run_window_start": "2026-04-24T08:00:00Z",
      "call_preference": "markdown"
    }
  }'

# httpie (recommended — читабельніше, auto-JSON)
http POST :8288/e/test-key \
  name=morning-brief.tick \
  data:='{"organization_id":"<UUID>","run_window_start":"2026-04-24T08:00:00Z","call_preference":"markdown"}'
```

### 5.3 Replay production run

Prod Inngest dashboard → Runs → filter → click failed run → "Replay". Runs через actual prod endpoint, uses prod env.

### 5.4 Pause / resume

Dashboard → Functions → click function → "Pause". Використовуй якщо bad code deploy'нулось і пише погані дані.

---

## 6. Git

### 6.1 Branch naming

```bash
git checkout -b feat/widget-revalidation
git checkout -b fix/telli-signature-verify
git checkout -b docs/update-runbook
# NEVER: mybranch, test, fix-stuff
```

### 6.2 Commit format

```bash
git commit -m "[BBH] add Zod schema for NarrativeSimulateRequest

Створено lib/events.ts з schema для narrative.simulate-request.
Інтеграція з Inngest EventSchemas.fromZod — типізація працює.
Тести додано: tests/schemas/events.test.ts — 3 success + 2 failure cases."
```

Правила з CLAUDE.md §6:
- Subject ≤72 chars з `[BBH]` prefix.
- Body українською, prose не bullets.
- Imperative mood у subject.

### 6.3 Merge

```bash
# squash merge локально
git checkout main
git merge --squash feat/xxx
git commit                              # edit squash message
git push

# Або через GitHub UI: "Squash and merge" button.
# Швидше: gh pr merge --squash --delete-branch
```

### 6.4 Rewrite history (обережно)

```bash
git rebase -i HEAD~N                    # squash N commits локально
git-filter-repo --invert-paths --path secret.env    # strip file з усієї історії
git push --force-with-lease             # обов'язково --with-lease на shared branches
```

`git-filter-repo` ставиться окремо: `brew install git-filter-repo`. Треба тільки для secret-leak recovery.

### 6.5 Common recovery

```bash
git reflog                               # undo мало не все
git reset --hard HEAD@{N}                # move до попереднього state
git cherry-pick <SHA>                    # grab single commit з іншої branch
git stash && git stash pop               # temporarily park changes
```

### 6.6 GitHub CLI (gh)

```bash
gh pr create --fill                      # PR з commit message body
gh pr view --web                         # відкрити у браузері
gh pr checks                             # CI status
gh run watch                             # live tail active workflow
gh run rerun <id> --failed               # retry failed jobs
```

---

## 7. Testing

### 7.1 Vitest

```bash
pnpm test                                # run all
pnpm test <file-pattern>                 # pnpm test snapshots
pnpm test --run                          # CI mode (no watch)
pnpm test:watch                          # interactive
pnpm test --coverage                     # з coverage report
```

Config: `vitest.config.ts`. Tests живуть як `*.test.ts` поряд з source або у `tests/`.

### 7.2 Playwright E2E

```bash
pnpm test:e2e                            # all
pnpm test:e2e demo-dashboard.spec.ts     # specific
pnpm test:e2e --ui                       # interactive UI
pnpm test:e2e --headed                   # see browser
pnpm exec playwright install             # install browsers (one-time)
pnpm exec playwright codegen localhost:3000  # generate test з recorded actions
```

### 7.3 Coverage gate

Configured у `vitest.config.ts`: 70% на `lib/schemas/` + `inngest/functions/`. Якщо fail — CI blocks merge.

```bash
pnpm test --coverage
open coverage/index.html                 # browse uncovered lines
```

---

## 8. Linting & formatting

```bash
pnpm lint                                # eslint + prettier check
pnpm lint --fix                          # auto-fix
pnpm format                              # prettier write .
```

ESLint config: `eslint.config.js` (flat config, ESLint 9+).
Prettier config: `.prettierrc` or `prettier.config.js`.

**Pre-commit:** husky + lint-staged configured — lint run'иться auto'матично перед commit для staged files.

---

## 9. Scripts для specific workflows

### 9.1 Trigger pipeline run манально (dev)

```bash
# W6′ Slack morning brief для Attio demo brand (curl)
curl -X POST http://localhost:3000/api/trigger/morning-brief \
  -H "Content-Type: application/json" \
  -d '{"organization_id": "00000000-0000-0000-0000-00000000a771"}'

# httpie варіант
http POST :3000/api/trigger/morning-brief organization_id=00000000-0000-0000-0000-00000000a771
```

(Route handler `/api/trigger/*` — dev-only, disabled у prod через env check. W6 voice path — `[DEFERRED]`.)

### 9.2 Seed demo brand з fresh state

```bash
supabase db reset                        # wipes + re-seeds
# або без wipe:
psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/seed.sql
```

### 9.3 Dump production data (для local debugging)

```bash
# ТІЛЬКИ для non-PII tables (runs, cost_ledger):
supabase db dump --linked --data-only -t runs -t cost_ledger > /tmp/prod-runs.sql
psql postgresql://postgres:postgres@localhost:54322/postgres -f /tmp/prod-runs.sql

# Ad-hoc analytics без psql ceremony:
psql postgresql://postgres:postgres@localhost:54322/postgres \
  -c "copy (select * from cost_ledger) to stdout csv header" > /tmp/cost.csv
duckdb -c "from read_csv_auto('/tmp/cost.csv') select run_id, sum(usd) group by 1 order by 2 desc limit 10"
```

**Never** dump'уй `users`, `counter_drafts`, `snapshots`, `signals` — містять org-private data.

### 9.4 Export narrative для external review

```bash
# через SQL client:
select
  id,
  summary_markdown,
  highlighted_themes,
  generated_at
from narratives
where organization_id = '<UUID>'
order by generated_at desc
limit 10;
```

### 9.5 Audio для voice fallback (ffmpeg) `[DEFERRED — W6 voice cut, kept for post-hackathon reactivation]`

```bash
# Скоротити Telli recording до 30s fallback snippet
ffmpeg -i telli-recording.wav -t 30 -c:a libmp3lame -b:a 128k \
  public/demo-fixtures/brief-fallback.mp3

# Конвертувати ElevenLabs TTS output у формат що Telli приймає (16kHz mono WAV)
ffmpeg -i tts-output.mp3 -ar 16000 -ac 1 public/demo-fixtures/brief.wav
```

### 9.6 Refresh Peec snapshot

```
# У Claude Code session у репо:
> refresh peec snapshot
```

Я (Claude) виконаю script `scripts/_peec-pull.ts` що пере-pull'ить дані через MCP tools і overwrite'ить `data/peec-snapshot.json`. Деталі — `RUNBOOK.md §1.5`.

---

## 10. Environment variables (quick reference)

Full inventory — `RUNBOOK.md §5.1`. Quick list для `.env.local`:

```bash
# Supabase (local: з supabase status)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<local-anon>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role>

# Inngest (local dev: no keys needed, uses local signing)
# INNGEST_SIGNING_KEY=
# INNGEST_EVENT_KEY=

# LLMs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Live external APIs
TAVILY_API_KEY=tvly-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Peec — accessed via committed snapshot file (per decisions/2026-04-25-mcp-only-peec-attio-demo.md)
PEEC_SNAPSHOT_PATH=./data/peec-snapshot.json

# Deferred (post-hackathon)
# FIRECRAWL_API_KEY=fc-...
# TELLI_API_KEY=...
# TELLI_WEBHOOK_SECRET=...
# ELEVENLABS_API_KEY=...

# Config
DEMO_BRAND_ID=00000000-0000-0000-0000-00000000a771
DEMO_BRAND_SLUG=attio
```

З direnv — у `.envrc`: `dotenv .env.local` + `direnv allow`. Тоді vars auto-load при `cd`.

---

## 11. Cross-references

- Architectural context → `ARCHITECTURE.md`.
- Precise contracts / shape reference → `CONTRACTS.md`.
- Per-pipeline debugging → `PIPELINES.md §failure modes`.
- Deploy / rollback / incident procedures → `RUNBOOK.md`.
- Known tool drift / version issues → `GAPS.md`.
