---
date: 2026-04-24
status: accepted
topic: state storage
supersedes: 2026-04-24-file-state-no-database.md
superseded_by: none
adr_ref: ADR-002-R (new brand-intel/ARCHITECTURE.md)
---

# State у Supabase Postgres з pgvector, organization_id scope + RLS

## Context

Попереднє рішення (ADR-002) тримало весь state у JSON/JSONL/Markdown файлах. Підходило для plugin-era (solo-use, локальний runtime). Після pivot на webapp (ADR-001-R) file-based state не підходить:

- Serverless functions не мають shared disk — кожен cold start починає з пустого FS.
- Widget W4 треба SSR з DB за <100ms — grep JSONL не вкладається.
- Multi-user (хоч демо solo, але журі може клікати одночасно) — pid-lock per-brand для concurrent web traffic малопридатний.
- Embedding similarity (ADR-005 successor) для snapshot clustering і signal dedup вимагає vector index.
- Supabase вже обрано в ADR-001-R як bundle — DB у нас є безкоштовно.

## Decision

Весь state живе у Supabase Postgres з pgvector:

- **Кожна таблиця має `organization_id` колонку** — scoping для N брендів (ADR-005 адаптація).
- **RLS (Row Level Security)** на всіх таблицях через `get_user_org_id()` helper function.
- **pgvector columns** на `snapshots.embedding`, `citations.embedding`, `signals.embedding` — для similarity search і dedup.
- **Schema-as-code** — міграції в `supabase/migrations/*.sql`, без manual DB edits.
- **Zod schemas** валідують agent output ПЕРЕД INSERT — guardrail проти малформованих даних.
- **Storage bucket** для generated assets (counter-drafts pdf/png, snapshot archives).
- **No JSONL** — все structured у відповідних таблицях (runs, snapshots, citations, signals, counter_drafts, narratives, cost_ledger).

Human-readable view — через `/demo` dashboard, не через `cat state/file.jsonl`.

## Alternatives considered

- **File state у Supabase Storage** — зберігаємо JSONL як blob. Втрачаємо queries, pgvector, RLS. Відкинуто.
- **Postgres без pgvector** — OK для MVP, але embedding-based dedup/clustering заплановано для W9 (competitor radar) і W5 (narrative similarity). Pgvector extension включається одним migration statement — не економимо нічого відкладаючи.
- **MongoDB/Firestore** — document model feel like good fit для snapshots, але втрачаємо joins. Supabase вже обрано в ADR-001-R, дублювати backend не маємо сенсу.
- **Drizzle vs Prisma** — Drizzle виграє через кращу Supabase integration і lower overhead на serverless cold start. (Technical detail, не architectural.)

## Reasoning

- **Queries працюють** — widget "показати 7 найсвіжіших snapshots для brand X" = 1 SQL за <10ms.
- **RLS як GDPR guardrail** — неможливо accidentally leak'нути цитати одного бренду в dashboard іншого. Policy declarative.
- **Pgvector unlocks:** snapshot similarity (W5/W6 "цей story повторюється"), citation clustering (W4 "групи наративів"), signal dedup (W9 "той самий competitor move вже був").
- **Schema migrations** як audit trail архітектурних змін.
- **Zod перед INSERT** — перехоплює LLM output drift до того як malformed data опиниться в DB і загубить evidence chain.
- **Evidence-first architecture** легше enforce'ити через DB constraints (`evidence_refs NOT NULL`) ніж через markdown parsing.

## Trade-offs accepted

- **Більше moving parts** — Postgres + RLS policies + pgvector + migrations vs "cat file.jsonl".
- **Migration cost** — вся plugin-era схема (frontmatter у markdown) не переноситься 1:1, треба перепроектувати під relational + vector.
- **Ops** — Supabase managed, але дебаг RLS policies коштує час при помилках.
- **Supabase free tier limits** — 500MB DB, 2GB bandwidth, 1GB storage. Достатньо для hackathon і early post-demo. Upgrade path є.
- **Latency** — serverless → Supabase typically 20-80ms. Mitigation: connection pooling через Supavisor, edge functions для hot paths.

## Revisit when

- Storage >80% free tier → planning upgrade to Pro.
- Latency >200ms p95 на read paths → розглянути edge caching (Vercel KV) для widget static views.
- pgvector performance degrades >500k vectors → розглянути HNSW index tuning або dedicated vector DB (Pinecone/Qdrant).
- GDPR data deletion scope ускладнюється → додати explicit cascade rules або soft-delete з background purge.

## Migration from file-state

Plugin-era файли у `brand-intel/_archive/` більше не читаються runtime'ом. Якщо треба дані з plugin-era (test fixtures) — одноразово імпортуємо через seed script (`supabase/seed.sql`), не підтримуємо sync.
