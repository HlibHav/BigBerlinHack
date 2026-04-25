# CLI tools checklist

> Встановити **до** хакатону. Економить години дебагу. Порядок = пріоритет (essential першими).

**Platform:** macOS. Всі через Homebrew (`brew install ...`), якщо не сказано інше.

**Check installed:**
```bash
command -v jq yq rg bat direnv gh uv duckdb httpie ffmpeg watchexec hyperfine glow fx
```

---

## Essential (без них не почати)

### `jq` — JSON/JSONL query language
```bash
brew install jq
```
**Чому треба:** Весь state у `runs/*.jsonl`, `snapshots/*.jsonl`, `signals/*.jsonl`. Без jq ти читаєш файли очима.

**Типове використання:**
```bash
# Всі failed runs за сьогодні
cat state/self-promo/runs/2026-04-24-*.jsonl | jq 'select(.event=="run_end" and .ok==false)'

# Top-3 сигнали за severity
cat state/self-promo/signals/competitors.jsonl | jq -s 'sort_by(.severity) | reverse | .[0:3]'

# Кількість snapshots за prompt
jq -r '.prompt_id' state/self-promo/snapshots/*.jsonl | sort | uniq -c
```

### `yq` — YAML query (те саме що jq, але для YAML)
```bash
brew install yq
```
**Чому:** `config/*.yaml` — головний config. Потребуємо швидко читати поля з bash-скриптів.

```bash
yq '.tracked_prompts | length' config/self-promo.yaml
yq '.brand.id' config/*.yaml  # список всіх брендів
```

### `rg` (ripgrep) — fast grep
```bash
brew install ripgrep
```
**Чому:** `grep -r` повільний і шумний. `rg` поважає .gitignore і дає читабельний output. Must-have для пошуку усередині codebase.

### `bat` — cat з syntax highlighting
```bash
brew install bat
```
**Чому:** Читати JSONL руками — `cat` дає wall of text. `bat` підсвічує, paginate'ить, показує line numbers.

```bash
bat state/self-promo/briefs/2026-04-24.md
bat -l json state/self-promo/snapshots/*.jsonl
```

### `direnv` — auto-load env per directory
```bash
brew install direnv
# Add hook до ~/.zshrc: eval "$(direnv hook zsh)"
```
**Чому:** Secrets в `.env` автоматично інжектяться коли `cd` у plugin folder, auto-unload коли виходиш. Без direnv — ручний `source .env` щоразу.

```bash
# .envrc у plugin root:
dotenv
# direnv allow
```

### `gh` — GitHub CLI
```bash
brew install gh
gh auth login
```
**Чому:** Плагін може жити на GitHub (distribution). `gh` робить `gh release create`, `gh pr view`, etc. без браузера. Під час хакатону — швидко закидати code, робити демо-link.

---

## Productivity (сильно прискорюють workflow)

### `httpie` — curl з human syntax
```bash
brew install httpie
```
**Чому:** Тестувати Peec MCP / Tavily / Firecrawl / Telli endpoint'и з terminal перед тим як wrap'ити у скіл. `curl` працює але syntax крутиться у голові.

```bash
http POST api.tavily.com/search \
    Authorization:"Bearer $TAVILY_API_KEY" \
    query="example competitor news"
```

### `watchexec` — auto-rerun на зміну файла
```bash
brew install watchexec
```
**Чому:** Write-test-write loop. Змінюєш `skills/morning-brief/SKILL.md` → watchexec автозапускає smoke test.

```bash
watchexec --exts md,yaml,json -- make smoke
```

### `hyperfine` — benchmark
```bash
brew install hyperfine
```
**Чому:** Порівнювати "цей варіант скіла" vs "той варіант" — wall-time важливий для cost envelope. hyperfine дає normalized N-run results.

```bash
hyperfine 'claude -p "/brand-intel:morning-brief demo-brand --dry-run"' --warmup 1 --runs 5
```

### `glow` — markdown renderer у terminal
```bash
brew install glow
```
**Чому:** Brief-файл це markdown. `glow state/self-promo/briefs/2026-04-24.md` рендерить його у читабельний вигляд у терміналі замість raw source.

### `fx` — interactive JSON viewer
```bash
brew install fx
```
**Чому:** Коли треба **навігувати** великим JSON (vs просто query як з jq). Run: `fx state/self-promo/narratives/nc-xxx.json` — arrow keys, collapse/expand.

---

## Category: data & audio

### `ffmpeg` — audio/video conversion
```bash
brew install ffmpeg
```
**Чому:** TTS output — .mp3 або .wav. ffmpeg нормалізує, обрізає, конвертує якщо Telli/ElevenLabs дає один формат, а нам треба інший.

```bash
ffmpeg -i brief-voice.wav -b:a 128k brief-voice.mp3
```

### `duckdb` — SQL over jsonl/csv/parquet
```bash
brew install duckdb
```
**Чому:** Коли state накопичиться (>30 днів), jq-запити повільнішають. `duckdb` дає SQL по JSONL без setup бази.

```bash
duckdb -c "SELECT prompt_id, COUNT(*) FROM 'state/self-promo/snapshots/*.jsonl' GROUP BY prompt_id"
```

Не блокує v1 (jq хватить), але якщо опціонально встановити — скоротить debug-цикли в 10x коли полізе у historical data.

### `gdate` — GNU date (macOS native date слабкий)
```bash
brew install coreutils  # дає gdate, gls, gcat і т.д.
```
**Чому:** Часи у форматі ISO8601, арифметика дат (`now - 6h`), parsing. macOS `date` не підтримує зручний `-d "6 hours ago"`. `gdate` — підтримує.

```bash
gdate -u -d "6 hours ago" "+%Y-%m-%dT%H:%M:%SZ"
```

---

## Testing & quality

### `ajv-cli` — JSON Schema validator
```bash
npm install -g ajv-cli ajv-formats
```
**Чому:** Всі writes у `state/` валідуються по схемам з `contracts/*.schema.json`. `ajv` це робить з CLI — pre-commit hook, integration test.

```bash
ajv validate -s contracts/brief.schema.json -d state/self-promo/briefs/*.md  # для frontmatter-json частин
```

### `bats` — bash testing framework
```bash
brew install bats-core
```
**Чому:** Скіли = bash + claude -p invocations. `bats` — natively bash-test framework. Пише тести у форматі `@test "skill exits cleanly on missing config" { ... }`.

```bash
bats tests/skills/*.bats
```

### `shellcheck` — lint для bash
```bash
brew install shellcheck
```
**Чому:** Bash subtle. `shellcheck` ловить `$var vs "$var"`, unset variable risks, unquoted wildcards — усе що ми точно написали б неправильно на хакатоні поспіхом.

---

## Python stack (якщо пишемо helpers на Python)

### `uv` — швидкий Python package manager
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```
**Чому:** pip повільний, venv boilerplate'ний. `uv` — 10-100x швидший, lock'файли нативні. Якщо пишемо helper scripts — `uv run script.py` і все.

### `ruff` — Python formatter + linter
```bash
brew install ruff
```
**Чому:** Не хочемо витрачати час на black+isort+flake8+mypy — ruff робить 90% всього за мілісекунди.

---

## Secrets management (optional but recommended)

### `op` — 1Password CLI
```bash
brew install --cask 1password-cli
op signin
```
**Чому:** Якщо тримаєш ключі у 1Password (або Bitwarden — тоді `bw`), `op read "op://Private/Peec API/key"` інжектить у env без reveal.

```bash
# .envrc:
export PEEC_API_KEY=$(op read "op://Private/Peec API/key")
```

Не обов'язково — `.env` file рішення працює з direnv. Але якщо маєш 1Password — 10 хв setup, нуль ризику commit'нути ключ.

---

## Install everything (copy-paste)

```bash
# Essential
brew install jq yq ripgrep bat direnv gh

# Productivity
brew install httpie watchexec hyperfine glow fx coreutils

# Audio/data
brew install ffmpeg duckdb

# Testing
brew install bats-core shellcheck
npm install -g ajv-cli ajv-formats

# Python (якщо потрібно)
curl -LsSf https://astral.sh/uv/install.sh | sh
brew install ruff

# Secrets (optional)
brew install --cask 1password-cli
```

Час установки з теплого cache'у homebrew: ~3-5 хв. З cold cache: 10-15 хв.

---

## Post-install verification

```bash
# Швидкий sanity-check
command -v jq && jq --version
command -v yq && yq --version
command -v rg && rg --version | head -1
command -v direnv && direnv --version
command -v gh && gh --version | head -1
command -v httpie || command -v http && http --version
command -v ffmpeg && ffmpeg -version | head -1
command -v duckdb && duckdb --version
command -v bats && bats --version
command -v ajv && ajv --version
```

Якщо будь-яка команда не знайдена — `brew install {name}` або перевір `brew doctor`.

---

## NOT installing (і чому)

- **`awk`/`sed`** — встановлені нативно. Навіть якщо GNU-варіант кращий, `gsed`/`gawk` з coreutils рідко потрібні у нас.
- **`curl`** — встановлений. httpie — prefer для interactive, curl — для scripts.
- **Docker** — overkill для plugin. Не потрібен у stack.
- **jupyter/notebook** — не робимо exploration у notebook'ах. Якщо треба — `uv run --with jupyter jupyter lab`.
- **Postgres/Redis/etc** — ADR-002: no database. File-based only.
- **`aws`/`gcloud`/`az`** — не deploy'им у cloud у v1. Localhost + optional Vercel (для widget proxy) = все.
