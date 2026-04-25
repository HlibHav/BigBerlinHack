# Onboarding feature requirements

> Як новий користувач конфігурує BBH для свого бренду. Hackathon — read-only seed view. Post-hackathon — `/dashboard/competitors` editable + first-run wizard.

**Status:** hackathon read-only + post-hackathon backlog.
**Single source of truth:**
- Schemas → `brand-intel/CONTRACTS.md §3.3` (нова `competitors` table).
- Component layers → `brand-intel/ARCHITECTURE.md §3`.
- Scope decision → `decisions/2026-04-25-hackathon-scope-cut.md`.

---

## 1. Full user journey (post-hackathon)

1. User signs up → Supabase Auth → `users` row створюється з `organization_id` (manual для demo, automated post-monetization).
2. First-run wizard `/dashboard/onboarding` — 4 steps:
   - **Step 1: Brand identity.** `display_name`, `slug`, `local_timezone`. Saves у `organizations`.
   - **Step 2: Self-monitoring.** Add YOUR brand handles + URLs + search terms ("how would people search for us in ChatGPT?"). Creates `competitors` row з `relationship='self'`.
   - **Step 3: Competitors.** Add 3-10 competitor URLs/handles + search terms. Creates `competitors` rows з `relationship='competitor'`.
   - **Step 4: First radar.** "Run radar now" → triggers W9 → results visible у dashboard. Onboarding completes.
3. Post-onboarding redirect → `/dashboard/{slug}` (private, auth-gated).

Marketer feedback (round 1 #3): "How do I tell BBH who my competitors are? Якщо я редагую SQL вручну — продукт зламаний." → solved by Step 2-3 wizard.

---

## 2. Hackathon scope (today)

### Що ship'имо

- **Read-only competitors panel у `/demo/[brand]`.** `<Card>` секція з seed competitors. Detalji UI — `features/dashboard.md §2.2`.
- **"Add competitor" button** з shadcn `<Tooltip>` — текст: "Coming v2 — currently seeded via supabase/seed.sql".
- **Seed (`supabase/seed.sql`):**

```sql
-- Demo brand = Attio (per decisions/2026-04-25-mcp-only-peec-attio-demo.md)
-- 1 self row
insert into competitors (organization_id, display_name, relationship, homepage_url, handles, search_terms) values (
  :attio_org_id,
  'Attio',
  'self',
  'https://attio.com',
  '{"twitter": "@attio", "linkedin": "/company/attio"}'::jsonb,
  array['Attio', 'Attio CRM', 'modern CRM', 'flexible CRM']
);

-- 2 competitor rows (matched з Peec test project)
insert into competitors (organization_id, display_name, relationship, homepage_url, handles, search_terms) values
  (:attio_org_id, 'Salesforce', 'competitor', 'https://salesforce.com',
    '{"twitter": "@salesforce", "linkedin": "/company/salesforce"}'::jsonb,
    array['Salesforce', 'Salesforce CRM', 'Sales Cloud']),
  (:attio_org_id, 'HubSpot', 'competitor', 'https://hubspot.com',
    '{"twitter": "@HubSpot", "linkedin": "/company/hubspot"}'::jsonb,
    array['HubSpot', 'HubSpot CRM']);
```

### Що НЕ ship'имо

- Editable form для add/remove competitors.
- Auth-gated dashboard.
- First-run wizard.
- Slug picker / brand identity page.
- "Suggest competitors" auto-discovery (LLM-driven).
- Bulk import via CSV / Twitter list.

---

## 3. Schema dependency

**SSOT для DDL** — `brand-intel/CONTRACTS.md §3.3` (`competitors` table). Не дублюємо тут.

**Key columns використовувані цією feature:**
- `relationship` (`self` | `competitor`) — drives badge у UI + W9 LLM prompt context.
- `handles` jsonb — flexible map (`{twitter, linkedin, github, ...}`).
- `search_terms` text[] — input для Tavily query construction у W9.
- `is_active` boolean — soft delete без видалення history.

W9 radar reads `select * from competitors where organization_id = X and is_active = true` як scrape list.

---

## 4. Acceptance criteria

### Hackathon

- [ ] `/demo/attio` показує 3 competitor cards (1 self Attio + 2 competitors Salesforce/HubSpot) з seed.
- [ ] Кожна card має `display_name` + relationship badge ("self" зеленим / "competitor" сірим) + handles list (twitter @, linkedin /).
- [ ] "Add competitor" button з tooltip.
- [ ] Mobile Safari — card grid responsive (1 col на narrow viewport, 2 col на tablet+).
- [ ] No console errors.
- [ ] No PII у seed (тільки публічні handles).

### Post-hackathon (track-only)

- [ ] First-run wizard 4 steps complete без data loss між steps.
- [ ] Add/remove competitor flow без full page reload (Server Action + revalidate).
- [ ] RLS блокує cross-org reads/writes.
- [ ] Free tier cap: 3 competitors max до monetization.
- [ ] "Suggest competitors" button (LLM auto-suggest based на brand description) — стрейч.
- [ ] Multi-language search_terms (e.g. ['HubSpot', 'ХабСпот']) для regional brands.

---

## 5. Cross-references

- Schema → `brand-intel/CONTRACTS.md §3.3 Database schema` (after update).
- Component layers → `brand-intel/ARCHITECTURE.md §3 Next.js component layers`.
- Dashboard page де competitors відображаються → `brand-intel/features/dashboard.md §2.2`.
- Hackathon scope decision → `decisions/2026-04-25-hackathon-scope-cut.md`.
- W9 use of competitors list → `brand-intel/PIPELINES.md §W9`.
