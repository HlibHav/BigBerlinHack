# Runbook

> Операційні процедури. "Як зробити X" — step-by-step. Читається на ходу, без роздумів. Ніяких архітектурних пояснень — лише commands і expected output.

**Якщо не зрозуміло ЧОМУ щось так** — перевір [ARCHITECTURE.md](./ARCHITECTURE.md) або [GAPS.md](./GAPS.md).

---

## Index

1. [First-time setup](#first-time-setup)
2. [Add a new brand](#add-a-new-brand)
3. [Add a tracked prompt](#add-a-tracked-prompt)
4. [Add a competitor](#add-a-competitor)
5. [Approve/reject a counter-draft](#approvereject-a-counter-draft)
6. [Debug a failed run](#debug-a-failed-run)
7. [Pause/resume the agent](#pauseresume-the-agent)
8. [Recover from a crashed run](#recover-from-a-crashed-run)
9. [Rotate API keys](#rotate-api-keys)
10. [Roll weekly cost ledger](#roll-weekly-cost-ledger)
11. [Run smoke tests](#run-smoke-tests)
12. [Pre-demo checklist](#pre-demo-checklist)

---

## First-time setup

**Prereqs:** CLI tools з [CLI-TOOLS.md](./CLI-TOOLS.md) installed.

```bash
# 1. Clone / install plugin
cd ~/.claude/plugins
git clone https://github.com/yourorg/brand-intel.git
cd brand-intel

# 2. Copy env template
cp .env.example .env
# Edit .env — встав справжні ключі Peec, Tavily, Firecrawl, Anthropic, Telli

# 3. Enable direnv
direnv allow

# 4. Verify env loads
echo $PEEC_API_KEY   # має бути не пусто

# 5. Verify Claude plugin sees skills
claude /plugins list | grep brand-intel
# Очікуємо: brand-intel listed з 4 skills

# 6. Smoke test
make smoke    # або: bats tests/smoke/*.bats
```

**Success criteria:** всі smoke tests пройшли, `claude /brand-intel:check` відповідає "no brands configured yet".

---

## Add a new brand

```bash
# 1. Copy template
cp config/_template.yaml config/acme.yaml

# 2. Edit основні поля:
#    brand.id: acme  (має співпадати з filename без .yaml)
#    brand.name: "Acme Inc"
#    positioning.current: <one paragraph>
#    positioning.pillars: [3-5 bullet points]
#    sources.peec.project_id: <peec dashboard UUID>

# 3. Bootstrap prompts (optional, shortcut)
claude /brand-intel:suggest-prompts --brand acme
# → видає 15 candidate prompts, cut-paste у config

# 4. Bootstrap competitors
claude /brand-intel:suggest-competitors --brand acme
# → видає YAML stub, cut-paste у config

# 5. Validate config
yq '.' config/acme.yaml > /dev/null   # YAML parse check
ajv validate -s contracts/brand-context.schema.json -d config/acme.yaml

# 6. First dry-run brief
claude /brand-intel:morning-brief acme --dry-run
# Очікуємо: "Cold start — baseline being captured. Meaningful brief starts tomorrow."

# 7. Перший справжній run (витратить quota)
claude /brand-intel:morning-brief acme
```

**Troubleshoot:** якщо `ajv validate` fail'ить — дивись помилку, зазвичай missing required field. Template має бути complete — якщо у тебе не так, open issue.

---

## Add a tracked prompt

```bash
# Pick next unused ID (p001, p002, ...)
yq '.tracked_prompts[].id' config/self-promo.yaml | sort | tail -1
# Очікуємо: p014 (наступний буде p015)

# Edit config:
# Додай у .tracked_prompts:
#   - id: p015
#     query: "best AI visibility tools 2026"
#     lang: en
#     region: US
#     topic: ai-visibility
#     priority: med

# Validate
ajv validate -s contracts/brand-context.schema.json -d config/self-promo.yaml

# Next scheduled run підхопить. Або force:
claude /brand-intel:morning-brief self-promo
```

**Tip:** починай з `priority: low` для нового prompt — якщо сигнал є, підвищуй до med/high. Цим економиш quota.

---

## Add a competitor

```bash
# Знайди next id — бажано slug форма (unique у config)
yq '.tracked_competitors[].id' config/self-promo.yaml

# Edit config, додай:
#   - id: newco-ai
#     name: "NewCo AI"
#     urls: [https://newco.ai]
#     handles: {x: "@newcoai", linkedin: "linkedin.com/company/newco-ai"}
#     watch_sources: [peec, tavily, firecrawl]
#     severity_threshold: med

# Validate + trigger
ajv validate -s contracts/brand-context.schema.json -d config/self-promo.yaml
claude /brand-intel:competitor-radar self-promo --competitor-ids=newco-ai
# Перший радар-run встановить baseline
```

---

## Approve/reject a counter-draft

```bash
# 1. Подивись що ready
ls state/self-promo/counter-drafts/
# 2026-04-24-sig-a1b2c3.md

# 2. Читаємо
glow state/self-promo/counter-drafts/2026-04-24-sig-a1b2c3.md

# 3a. APPROVE:
# Edit frontmatter: status: draft → status: approved
# Потім ручно публікуй контент у X/LinkedIn (draft-only policy).
# Позначити публікацію:
# Edit: published_at: 2026-04-24T14:30:00Z, published_url: https://x.com/...

# 3b. REJECT:
# Edit frontmatter: status: draft → status: rejected
# Додай reason_for_rejection: "tone off, competitor angle wrong"
# Файл залишається у state (для навчання майбутніх drafts).
```

**No CLI для цього зараз** — це manual text edit. v1.1 додамо `brand-intel:approve {sig_id}`.

---

## Debug a failed run

```bash
# 1. Знайди останні errors
rg '"ok":false' state/self-promo/runs/*.jsonl | head

# 2. Відкрий весь trace для конкретного run_id
RUN_ID=run-a1b2c3
jq 'select(.run_id=="'$RUN_ID'")' state/self-promo/runs/*.jsonl

# 3. Knownі причини (у порядку ймовірності):
#    a) Peec quota hit → подивись у event="external_call" system="peec" ok:false
#    b) Claude API timeout → event="external_call" system="claude" error_code=timeout
#    c) Subagent schema violation → event="subagent_return" ok:false reason:"schema_violation"
#    d) Stale lock → event="lock_skip" (попередній run не закінчився)

# 4. Для (a): чекай weekly reset АБО підвищ budget у config
# 5. Для (b): retry — Claude зазвичай transient. Якщо 3+ разів підряд — щось глобальне.
# 6. Для (c): читай subagent output у state/{brand}/tmp/subagent-{id}.json
# 7. Для (d): rm state/{brand}/.lock якщо впевнений що stale (pid не існує)
```

---

## Pause/resume the agent

### Pause (travel, vacation, budget overshoot)
```bash
# Option A — per-brand config
yq -i '.scheduling.paused_until = "2026-05-01T00:00:00Z"' config/self-promo.yaml

# Option B — глобальний kill switch (всі бренди)
touch config/_global.disabled
# При resume: rm config/_global.disabled
```

### Resume
```bash
# Видаляємо pause
yq -i 'del(.scheduling.paused_until)' config/self-promo.yaml

# Або якщо глобальний:
rm config/_global.disabled

# Manual trigger для catch-up
claude /brand-intel:check self-promo --command=auto
```

---

## Recover from a crashed run

**Signs:** skill не повертає output, або `.lock` файл >30 min old.

```bash
# 1. Перевір pid-lock
cat state/self-promo/.lock
# {"pid": 12345, "skill": "competitor-radar", "started_at": "..."}

# 2. Перевір чи pid ще живий
kill -0 $(jq -r .pid state/self-promo/.lock) 2>/dev/null && echo ALIVE || echo DEAD

# 3. Якщо DEAD і lock older 30 min:
rm state/self-promo/.lock

# 4. Подивись чи є partial state у tmp/
ls state/self-promo/tmp/
# Якщо є subagent-*.json — ти можеш вручну злити (не обов'язково).

# 5. Clean tmp
rm state/self-promo/tmp/*.json

# 6. Restart
claude /brand-intel:check self-promo --command=auto
```

---

## Rotate API keys

Все через `.env` + direnv. Процедура:

```bash
# 1. Отримай новий key від провайдера
#    (Peec dashboard, Anthropic console, etc.)

# 2. Edit .env
vi brand-intel/.env
# Заміни старий на новий

# 3. Reload env у поточному shell
direnv reload

# 4. Test
http POST api.tavily.com/search Authorization:"Bearer $TAVILY_API_KEY" query=test
# Очікуємо 200

# 5. Revoke старий key у провайдера dashboard

# 6. Запусти smoke tests
make smoke
```

**Note:** Claude Code plugin runtime може кешувати env — рестартни Cowork після rotate якщо підозрюєш.

---

## Roll weekly cost ledger

**Auto:** orchestrator робить це при першому запуску >7d після last roll. Manual не потрібен у normal case.

**Manual (якщо потрібен):**
```bash
BRAND=self-promo
WEEK=$(gdate -u -d 'last monday' '+%Y-W%V')
mv state/$BRAND/cost-ledger.jsonl state/$BRAND/cost-ledger/archive-$WEEK.jsonl
touch state/$BRAND/cost-ledger.jsonl
```

---

## Run smoke tests

```bash
# Всі smoke
bats tests/smoke/*.bats

# Один скіл
bats tests/smoke/morning-brief.bats

# Verbose
bats --verbose-run tests/smoke/competitor-radar.bats
```

Smoke = zero external calls. Якщо fail — проблема у логіці скіла або у local env, не у зовнішньому API.

### Run integration tests (costs ~$0.20)
```bash
make test-integration
# Запускає ланцюг test-brand → реальні Peec/Tavily/Claude calls → validate outputs
```

---

## Pre-demo checklist (day before hackathon)

```
[ ] brew doctor — жодних warnings
[ ] direnv allow — у plugin folder
[ ] .env — всі ключі свіжі (test кожний http ping)
[ ] config/demo-brand.yaml — prepopulated
[ ] state/demo-brand/snapshots/ — 3 дні pre-captured
[ ] state/demo-brand/signals/competitors.jsonl — 2 seeded "fresh" signals
[ ] state/demo-brand/counter-drafts/ — 1 pre-generated draft
[ ] Telli account — 1 test call успішна
[ ] Telli backup — pre-recorded audio файл у demo/fixtures/
[ ] Widget W4 — deployed (Vercel/Cloudflare) і accessible
[ ] Internet — primary WiFi + phone hotspot tested
[ ] Laptop — autolaptop off, notifications silenced
[ ] Slack/Discord/iMessage — notifications disabled
[ ] Demo script — run-through 3 рази, wall-time ≤4 min
[ ] Git — all commits pushed, tag release `v0.1-hackathon`
[ ] Backup laptop — за наявності, той самий setup
[ ] Browser — open tabs pre-loaded:
    - widget test page
    - ChatGPT (logged in)
    - Peec dashboard (для screenshot'у якщо треба)
```

---

## If something falls apart

**General triage order:**
1. **Network?** Phone hotspot → re-test.
2. **API?** `http GET healthcheck endpoints` → дивися чи зовнішнє живе.
3. **Local state?** `ls state/{brand}/` → consistency check.
4. **Plugin loaded?** `claude /plugins list` — бачимо brand-intel?
5. **Скажено dependencies?** `brew doctor` + `direnv status` + `node -v` + `uv --version`.

Якщо все вище ok і не можеш відтворити — логи у `state/{brand}/runs/*.jsonl` скажуть де.
