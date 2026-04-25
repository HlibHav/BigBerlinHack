# Supabase Contract

> Lazy-loaded коли user prompt згадує: supabase, migration, table, RLS, psql, seed, DDL, schema, postgres, pgvector

**Schema-as-code.** Кожна зміна — migration у `supabase/migrations/{timestamp}_{name}.sql`. Ніякого manual DDL на прод.

**Обов'язкові колонки на кожній таблиці:**

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz` (або trigger, або application-level)

**RLS на кожній таблиці:**

```sql
alter table {t} enable row level security;
create policy "{t}_org_isolation" on {t}
  for all using (organization_id = public.get_user_org_id());
```

Для public demo brand — окрема policy `"{t}_public_demo"` що дозволяє read через `organization_id = DEMO_BRAND_ID` без auth.

**Enums.** Тримаємо як Postgres enums (не text з check constraint), генеруємо TS types через `supabase gen types typescript`.

**pgvector indices.** HNSW для >10k rows, IVFFlat для менших. `embedding vector(1536)` — OpenAI `text-embedding-3-small` dimensions.

**Storage buckets (hackathon-active):** `counter-drafts/`, `snapshots-raw/`. `voice-recordings/` `[DEFERRED — W6 voice cut]`. RLS policies на buckets через `storage.objects`.

**Seed data для демо** — `supabase/seed.sql` prepopulates Attio organization (UUID `00000000-0000-0000-0000-00000000a771`, slug `attio`) + 3 competitors (Attio self + Salesforce + HubSpot) + ≥1 high-severity signal + ≥1 pending counter-draft. Peec data — окремий committed file `data/peec-snapshot.json`. Re-runnable. Per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`.

---

## Перед тим як написати `supabase.from(...)`

1. Таблиця існує? `supabase/migrations/` перевір.
2. Types regenerated? `pnpm types:gen` потрібен?
3. RLS policy покриває цей query? Default deny — якщо сумніваєшся, читай policy.

---

## Gate A — DB writes (Supabase INSERT/UPDATE)

- [ ] Zod schema parse'нула дані **перед** запитом.
- [ ] `organization_id` встановлений і відповідає контексту запиту.
- [ ] RLS policy перевірена (не покладаємося лише на service role бо може обійти захист accidentally).
- [ ] Немає hardcoded PII/secret'ів у insert payload.
- [ ] Evidence refs (де застосовно) — ≥1, валідні URL/DB refs.
