# Folder tree reference

> Канонічна layout-структура плагіна. Коли матеріалізується — відповідає цьому.

```
brand-intel/                           # plugin root
│
├── README.md                          # overview, scope
├── ARCHITECTURE.md                    # components, ADRs, topology
├── CONTRACTS.md                       # schemas, signatures
├── SKILLS.md                          # per-skill specs
├── CHANGELOG.md                       # coming (after first release)
│
├── plugin.json                        # Claude Code plugin manifest (TBD)
├── scheduled-tasks.json               # scheduler config (TBD)
│
├── config/
│   ├── _template.yaml                 # reference BrandContext (DOCS/REFERENCE ONLY)
│   ├── self-promo.yaml                # populated per brand
│   └── vck.yaml
│
├── skills/                            # SKILL.md files, one per workflow
│   ├── check/
│   │   └── SKILL.md                   # orchestrator — invoked as /brand-intel:check
│   ├── morning-brief/
│   │   └── SKILL.md                   # W6 — /brand-intel:morning-brief
│   ├── narrative-simulator/
│   │   └── SKILL.md                   # W5 — /brand-intel:narrative-simulator
│   ├── competitor-radar/
│   │   └── SKILL.md                   # W9 — /brand-intel:competitor-radar
│   └── _prompts/                      # shared prompts referenced by skills
│       ├── brief-summarize.md
│       ├── brief-voicify.md
│       ├── narrative-judge.md
│       ├── signal-classify.md
│       └── counter-draft.md
│
├── contracts/                         # JSON Schemas (machine-readable shapes)
│   ├── brand-context.schema.json
│   ├── visibility-snapshot.schema.json
│   ├── competitor-signal.schema.json
│   ├── narrative-candidate.schema.json
│   ├── counter-draft.schema.json
│   ├── brief.schema.json
│   └── run-event.schema.json
│
├── state/                             # PER-BRAND state (git-ignored from v1)
│   ├── .gitignore                     # "*" except .gitkeep files
│   ├── self-promo/
│   │   ├── snapshots/
│   │   │   └── 2026-04-24T08-00-00Z.jsonl
│   │   ├── signals/
│   │   │   └── competitors.jsonl
│   │   ├── narratives/
│   │   │   └── nc-2026-04-24-001.json
│   │   ├── counter-drafts/
│   │   │   └── 2026-04-24-sig-7x9y2z.md
│   │   ├── briefs/
│   │   │   ├── 2026-04-24.md
│   │   │   └── 2026-04-24-voice.txt
│   │   ├── runs/
│   │   │   └── 2026-04-24-run-a1b2c3.jsonl
│   │   ├── cache/
│   │   │   └── peec/
│   │   │       └── 2026-04-24T08-00-00Z/
│   │   │           └── p001-chatgpt.json
│   │   └── tmp/                       # subagent workspace, auto-cleaned
│   │       └── subagent-*.json
│   └── vck/ ...                       # same layout
│
├── widget/                            # W4 — standalone, not part of skills
│   ├── README.md
│   ├── embed.js
│   └── proxy/                         # server-side Peec proxy (optional)
│
└── docs/
    ├── folder-tree.md                 # this file
    ├── adr/                           # full ADRs extracted from ARCHITECTURE.md
    │   ├── 001-deployment.md
    │   ├── 002-file-state.md
    │   ├── 003-subagent-boundary.md
    │   ├── 004-scheduling.md
    │   └── 005-brand-parameter.md
    ├── integrations/
    │   ├── peec-mcp-shape.md          # адаптер + live shape snapshot
    │   ├── tavily.md
    │   └── firecrawl.md
    └── ops/
        ├── cron-fallback.md           # якщо Cowork не running
        └── backup-restore.md
```

## Розмір на диску (очікуваний)

За припущення 10 prompts × 5 LLMs × 365 днів × ~2KB raw response:

- `snapshots/` — ~18MB/рік
- `signals/` — ~1-5MB/рік
- `cache/peec/` — trimmed 30 днів, ~1.5GB в peak (якщо raw responses великі)
- `runs/` — ~5-10MB/рік
- `briefs/` + `counter-drafts/` + `narratives/` — ~50MB/рік

Все разом — <20GB навіть при найагресивнішому раді. Файлова система тримає easily. Якщо не тримає — переходимо на duckdb-over-jsonl (v2).

## Git policy

- **Commit:** code, SKILL.md, contracts, docs, config/* (without secrets).
- **Ignore:** state/, secrets/, *.mp3, cache/.
- **Exception:** `state/{brand}/briefs/` — можна опціонально commit'ити для історії (без voice audio files).

Секрети ніколи не у repo — тільки ENV через `config.sources.*.api_key_env`.

## Multi-brand scaling

Додати новий бренд = створити `config/{new-brand}.yaml` + нічого більше. Skіли обробляють `brand_id` як параметр. `state/{new-brand}/` створиться при першому запуску скіла.
