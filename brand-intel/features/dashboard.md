# Dashboard feature requirements

> `/demo/[brand]` page — main demo surface на хакатоні. Mobile-first, public RLS, 7 sections + footer.

**Status:** hackathon scope (W9 + W5 + W7 + W6′ + UX patches).
**Single source of truth:**
- DB schemas → `brand-intel/CONTRACTS.md §3 Database schema`.
- Inngest events → `brand-intel/CONTRACTS.md §1 Inngest event contracts`.
- Server Actions pattern → `brand-intel/CONTRACTS.md §4.2`.
- SSR/RSC pattern → `brand-intel/ARCHITECTURE.md §2-3`.
- Scope decision → `decisions/2026-04-25-hackathon-scope-cut.md`.

---

## 1. URL & access

- Path: `/demo/[brand]` де `[brand]` — `organizations.slug` (e.g. `/demo/attio` для hackathon demo).
- Access: public. RLS policy `*_public_demo` дозволяє select для `organization_id = current_setting('app.demo_brand_id', true)::uuid`.
- iframe embed: not supported для `/demo`. Widget'ова embeddable версія — post-hackathon, окрема route `/widget/[brand]`.

---

## 2. Layout — 7 sections (top-down) + footer

### 2.1 Audit panel (top, sticky на mobile)

**Marketer pain #6 (radar runs blind) + #7 (need digest UI not voice) — full fix.**

Дані: latest non-null `runs` row для цієї org з `function_name = 'competitor-radar'`.

Schema (`runs.stats jsonb`):

```json
{
  "function_name": "competitor-radar",
  "started_at": "2026-04-25T09:30:00Z",
  "duration_seconds": 47,
  "sources_scanned": 4,
  "signals_total": 8,
  "signals_by_severity": {"high": 1, "med": 3, "low": 4},
  "drafts_generated": 1,
  "cost_usd_cents": 240
}
```

UI:
- Heading: "Last radar — 5 min ago" (relative time).
- Stats grid: scanned, signals (з severity breakdown chips), drafts, **cost badge** "$2.40".
- Status indicator: green dot "ok" / red "failed" з `runs.ok`.
- "Run radar now" CTA button (right-aligned).

Empty state: "No radar runs yet. Click 'Run radar now' to scan competitors."

### 2.2 Competitors panel

**Marketer pain #3 (missing onboarding) — light fix.** Detailed reqs — `features/onboarding.md §2`.

Query: `select * from competitors where organization_id = X and is_active = true order by relationship desc, display_name`.

UI: collapsible `<Card>` (default expanded).
- Heading: "Tracking 4 competitors" + "+" button (tooltip "Coming v2").
- Per competitor mini-card:
  - `display_name` як heading.
  - Relationship badge: "self" (green) / "competitor" (gray).
  - Handles inline: 🐦 @handle, 💼 /company/...
  - Search terms muted text.

### 2.3 Active signals (24h)

**Marketer pain #6 (all activity visible) — full fix.**

Query: `select s.*, c.display_name as competitor_name, c.relationship from signals s left join competitors c on s.competitor_id = c.id where s.organization_id = X and s.created_at > now() - interval '24h' order by s.severity desc, s.created_at desc`.

UI:
- Heading: "Signals (last 24h)".
- Filter chips (client component): `<All>` `<High>` `<Medium>` `<Low>`. Default: All.
- Per signal `<Card>`:
  - Severity badge color-coded: red (high) / amber (med) / gray (low).
  - Competitor name + relationship badge.
  - `summary` (1-2 lines).
  - `source_url` як small "View source" link.
  - Click row → modal з повним `reasoning` + `evidence_refs` clickable list.
  - **For medium signals only:** "Generate counter-draft" button (on-demand W9-style draft, no auto-create per ADR).
- Empty state: "No signals yet. Run radar to populate."

### 2.4 Counter-drafts queue

**Marketer pains #1 (approval bottleneck) + #2 (no CMS bridge) — full fix #1, light fix #2.**

Query: `select * from counter_drafts where organization_id = X and status = 'draft' order by created_at desc`.

UI per draft `<Card>`:
- Body preview (first 280 chars + "Show more" expand).
- Channel hint badge (X / LinkedIn / Blog / Multi).
- Tone pillar chip.
- Reasoning (collapsible accordion).
- Evidence chain: links to signals що стали джерелом.
- 4 action buttons (in toolbar):
  - **Approve** — server action `reviewCounterDraft({status: 'approved'})`. Optimistic UI flip badge green. Toast "Approved".
  - **Reject** — `reviewCounterDraft({status: 'rejected'})`. Optimistic flip + toast.
  - **Copy as Markdown** — `navigator.clipboard.writeText(body)` + toast "Copied".
  - **Simulate alternatives** — emits `narrative.simulate-request` event з `seed_payload: {counter_draft_id}`. Triggers W5. UI scroll-to-section §2.5 + show loading state.

Empty state: "No drafts pending. High-severity signals auto-generate drafts."

Footer note: "Approved drafts available in v2 — connect HubSpot/Slack/Notion to publish."

### 2.5 Simulator outputs

Query: latest `narrative_variants` group (last simulator_run_id) для цієї org.

UI:
- Heading: "Last simulator run — N min ago" (or "Click 'Simulate alternatives' on any draft").
- 3 ranked variant `<Card>`:
  - Rank badge (#1 gold, #2 silver, #3 bronze).
  - Score progress bar (0-1).
  - `body` (full text).
  - Score reasoning (collapsible).
  - "Use this variant" button → creates new counter_draft з `body` from variant + `evidence_refs` (post-hackathon — for now stub або toast "Coming v2").

Empty state: "Run simulator to compare positioning variants. We'll test 3 angles × 5 customer prompts × 2 LLM models = 30 simulations."

### 2.6 Email digest preview — SUPERSEDED by §2.8 (Morning brief real send)

Per `decisions/2026-04-25-peec-overlay-pivot.md`: morning brief preview replaced by real Slack send. Section retained для historical reference; UI removed from dashboard. See §2.8 below.

### 2.7 Multi-channel content variants (W7 output)

**Connected до §2.4 — counter-draft approval auto-triggers W7.** Detailed reqs → `features/content-expansion.md`.

Per parent counter-draft, after approval:
- Draft card у §2.4 збагачується accordion "Multi-channel variants (4)".
- Expand → 4 variant cards (blog | x_thread | linkedin | email).
- Per variant card:
  - Channel icon + name badge (📝 blog / 🐦 x_thread / 💼 linkedin / 📧 email).
  - Title (blog only) + body preview (first 200 chars + "Show full" expand).
  - Status badge: `generated` (default) / `sent` (manual flip) / `archived`.
  - Actions: **Copy as Markdown** (channel-aware: x_thread = numbered list, email = `Subject: ...\n\n{body}`), **Mark as sent** (manual flip), **Show full** (modal з повним body + metadata).
  - Email variant: copy-paste до user's email tool (no auto-send hackathon).

Empty state (no approved drafts yet): "Approve a counter-draft above to generate multi-channel variants."

### 2.8 Morning brief (W6′ real Slack send)

**Marketer pain #7 (voice = artifact) — full fix через text + real send.** Detailed reqs → `features/morning-brief.md`.

Bottom of dashboard, before v2 footer:

UI:
- Heading: "Morning brief"
- Latest sent: timestamp + Slack permalink (clickable якщо available).
- Preview card: rendered brief markdown (HTML, Slack-flavored — `*bold*`, links, etc.).
- Stats summary: signal count, severity breakdown, drafts pending, Peec pulse delta.
- Action buttons:
  - **"Send today's brief now"** — server action emits `morning-brief.tick` → Slack send → toast confirm.
  - **"Refresh preview"** — re-synthesize without sending (для review перед manual send).
- Empty state: "No brief sent today. Click 'Send now' to generate + post to Slack."
- Error state: "Failed to send. Reason: {error}. Check SLACK_WEBHOOK_URL."

Footer note within section: "Email delivery (Resend) ships v2. Per-timezone scheduling ships v2."

### 2.9 v2 footer note

Sticky footer (or end-of-page sticky):

> 🚧 Performance tracking, team collaboration, CMS publishing, email delivery, voice briefs, multi-region — coming v2. Today shows reaction loop core powered by Peec MCP.

---

## 3. Polling / revalidation strategy

- **Initial render:** SSR з server client (latest data при request).
- **After server action** (Approve/Reject/Copy): `revalidatePath('/demo/[brand]')` → re-fetch.
- **"Run radar now" + "Simulate alternatives":**
  1. Server action emits Inngest event.
  2. Returns immediately з optimistic "running..." state.
  3. Client `setInterval(5000)` polls `runs` table via dedicated route handler `/api/poll/run/{run_id}`.
  4. Once new run row має `finished_at != null` (or 90s timeout) → stop polling → `revalidatePath()`.
- **Real-time Supabase channels** — post-hackathon. Polling 5s достатньо для demo flow.

---

## 4. Server actions required

Reference: `brand-intel/CONTRACTS.md §4.2`.

```ts
// app/actions/radar.ts
"use server";
export async function triggerRadar(orgId: string): Promise<{run_id: string}>
// → emits competitor-radar.tick event
// → returns synthetic run_id для polling

// app/actions/simulator.ts
"use server";
export async function triggerSimulator(seedType: 'signal' | 'counter-draft', seedId: string): Promise<{run_id: string}>
// → emits narrative.simulate-request event

// app/actions/counter-draft.ts
"use server";
export async function reviewCounterDraft(input: {draft_id: string, status: 'approved' | 'rejected'}): Promise<{ok: true}>
// → UPDATE counter_drafts SET status, reviewed_at

export async function generateOnDemandDraft(signalId: string): Promise<{draft_id: string}>
// → triggers W9 draft step без full radar run, persists з status='draft'
```

Усі actions: Zod parse → Supabase mutation → revalidatePath.

---

## 5. Component structure

```
app/demo/[brand]/
├─ page.tsx                      # Server Component, fetches all data, composes sections
├─ loading.tsx                   # Suspense fallback (skeleton cards)
└─ error.tsx                     # Error boundary

components/dashboard/
├─ audit-panel.tsx               # Server Component (reads latest run.stats)
├─ run-radar-button.tsx          # Client Component (server action + polling)
├─ competitors-panel.tsx         # Server Component (read-only)
├─ signals-feed.tsx              # mixed (filter chips client)
├─ signal-card.tsx               # Server Component (modal client trigger)
├─ generate-draft-button.tsx     # Client Component (для medium signals)
├─ drafts-queue.tsx              # Server Component (list of cards)
├─ draft-card.tsx                # Client Component (approve/reject/copy/simulate buttons)
├─ simulator-outputs.tsx         # Server Component
├─ variant-card.tsx              # Server Component
├─ multi-channel-panel.tsx       # Server Component (W7 content variants accordion)
├─ morning-brief-panel.tsx       # Server Component (W6′ Slack brief preview + history)
├─ send-brief-button.tsx         # Client Component (manual "Send now" trigger)
├─ peec-data-source-badge.tsx    # Server Component ("Powered by Peec MCP")
└─ v2-footer.tsx                 # Server Component (static)
```

---

## 6. Acceptance criteria

### Functional

- [ ] All 7 sections + footer render без console errors на mobile Safari (iOS 17+).
- [ ] "Run radar now" → audit panel показує "running..." within 1s → new stats appear within 90s.
- [ ] "Simulate alternatives" on draft → simulator section updates within 60s.
- [ ] Approve / Reject — optimistic UI flips badge instantly (<100ms perceived), server action persists.
- [ ] Copy as Markdown copies body to clipboard, toast confirms.
- [ ] "Generate counter-draft" on medium signal creates draft row, appears у §2.4 within 30s.
- [ ] Severity color coding correct per CONTRACTS.md enum (red/amber/gray).
- [ ] Filter chips у signals feed працюють.
- [ ] Cost badge у audit panel формат "$X.XX".
- [ ] Morning brief panel rendered з last `brief_deliveries` row + "Send now" button live (per `features/morning-brief.md §7`).

### Non-functional

- [ ] Mobile responsive: 1 col на ≤640px, 2 col на tablet+, 3 col на desktop.
- [ ] First Contentful Paint <2s на 4G simulated.
- [ ] No layout shift during polling updates (skeleton placeholders match real card heights).
- [ ] All buttons keyboard-accessible (focus rings visible).
- [ ] Toast notifications не overlap критичні UI elements.

### Demo readiness

- [ ] `/demo/attio` повністю renders з seed data — нічого порожнього при first load.
- [ ] At least 1 high-severity signal у seed (для demo flow "approve this draft").
- [ ] At least 1 medium signal (для demo flow "click to generate draft on demand").
- [ ] At least 1 pending counter_draft у seed.
- [ ] Wall-time demo run-through ≤4 min, repeated 3x without bugs.

---

## 7. Cross-references

- DB schemas → `brand-intel/CONTRACTS.md §3` (signals, counter_drafts, runs.stats jsonb, competitors, narrative_variants).
- Inngest events → `brand-intel/CONTRACTS.md §1`.
- Server Actions → `brand-intel/CONTRACTS.md §4.2`.
- Topology / SSR pattern → `brand-intel/ARCHITECTURE.md §2-3`.
- Onboarding integration (competitors panel) → `brand-intel/features/onboarding.md`.
- W9 pipeline behavior → `brand-intel/PIPELINES.md §W9`.
- W5 pipeline behavior → `brand-intel/PIPELINES.md §W5`.
- Hackathon scope decision → `decisions/2026-04-25-hackathon-scope-cut.md`.
