---
date: 2026-04-24
status: superseded
topic: state storage
supersedes: none
superseded_by: 2026-04-24-storage-supabase-pgvector.md
adr_ref: ADR-002 (brand-intel/_archive/ARCHITECTURE.md)
---

> **SUPERSEDED 2026-04-24** — файл-state не виживає в serverless runtime (no shared disk, no vector search, no sub-100ms queries for widget SSR). Actual decision у `2026-04-24-storage-supabase-pgvector.md`.

# State у файлах (JSON/JSONL/Markdown), без БД

## Context

Треба зберігати: runs, snapshots, signals, counter-drafts, narratives, cost-ledger, per-brand config. Обсяг за рік — десятки MB. Багато append-write, нечасте query. Solo-use або team-scoped.

## Decision

Весь state — JSON/JSONL/Markdown файли у `state/{brand}/`. Без SQLite, Postgres, Redis. Concurrency — через pid-lock per brand.

## Alternatives considered

- **SQLite** — queries зручніші, але додає схему, міграції, бекапи. Для append-mostly workload overkill.
- **Postgres/Supabase** — повний overkill, окремий сервіс, latency penalty.
- **DuckDB over JSONL** — можливий v2 якщо jq query time стане >2s. Поки jsonl + jq достатньо.

## Reasoning

- Zero ops — немає БД яку треба підняти, бекапити, мігрувати.
- Trivial backup — `git`-іть папку або копіюйте.
- Людино-читаний state — founder відкриває файл і бачить що агент "знає".
- Subagent output легко пише у свій файл без shared connection.

## Trade-offs accepted

- Немає queries — "дай всі citations за місяць по domain=X" = stream read всі `snapshots/*.jsonl`. JSONL append-only дозволяє streaming.
- Concurrent writes не допускаємо — pid-lock per brand (див. ARCHITECTURE.md §4). Для solo use ок.

## Revisit when

- jq/stream-read приходить у >2s стабільно — міграція на duckdb-over-jsonl.
- З'являється multi-user concurrent write use-case (не планується).
