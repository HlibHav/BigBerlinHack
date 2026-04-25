# Multi-channel content expansion (W7) — feature requirements

> Один approved counter-draft → 4 variants для різних channels. Один approval, чотири готові outputs.

**Status:** hackathon scope (W7).
**Single source of truth:**
- DB schema → `brand-intel/CONTRACTS.md §3` (`content_variants` table).
- Inngest event → `brand-intel/CONTRACTS.md §1` (`content.expand-request`).
- LLM output schema → `brand-intel/CONTRACTS.md §2` (`ContentVariantSchema`).
- Pipeline behavior → `brand-intel/PIPELINES.md §W7`.
- Scope decision → `decisions/2026-04-25-peec-overlay-pivot.md`.

---

## 1. User journey

1. User reviews counter-draft у dashboard queue (W9 output, severity=high).
2. Clicks **"Approve"** → status flips до `approved`. Toast "Approved + generating multi-channel..."
3. **Auto-trigger** W7 Inngest function з `parent_counter_draft_id`.
4. Within ~30s, 3 channel variants з'являються у "Multi-channel" section (під drafts queue):
   - Blog post (~800 words, з title)
   - X thread (5 tweets, як array у metadata)
   - LinkedIn post (~200 words)
   - Email subject + body (subject у metadata, body у `body` field)
5. Per-variant actions: **Copy as Markdown**, **Edit** (post-hackathon), **Mark as sent** (manual status flip).
6. Email variant — copy-paste до user's email tool (no auto-send за hackathon scope).
7. Blog/LinkedIn — copy-paste до CMS/LinkedIn (post-hackathon — auto-publish via integration).
8. X thread — copy-paste до X composer (post-hackathon — auto-post via X API).

---

## 2. Inputs

- `counter_draft_id` (uuid) — parent draft що was approved.
- Read of: `counter_drafts.body`, `.tone_pillar`, `.channel_hint`, `.evidence_refs`, related signals from `evidence_refs`, organization brand voice (post-hackathon: `organizations.brand_voice_summary` text column; for hackathon: hardcoded brand voice prompt у LLM call).

---

## 3. Outputs (per `ContentVariantSchema`)

```ts
// lib/schemas/content-variant.ts (CONTRACTS.md §2.9)
export const ContentVariantSchema = z.object({
  channel: z.enum(["blog", "x_thread", "linkedin", "email"]),
  title: z.string().min(5).max(120).nullable(),         // null for x_thread, linkedin, email
  body: z.string().min(50),                              // main content; for email = email body
  metadata: z.record(z.unknown()).default({}),           // channel-specific:
                                                          //  blog: {meta_description, slug_suggestion}
                                                          //  x_thread: {tweets: string[]}  — array, кожен ≤280 chars
                                                          //  linkedin: {hashtags: string[]}
                                                          //  email: {subject, preheader}
  evidence_refs: z.array(z.string()).min(1),             // inherits parent's evidence_refs
});

export const ContentExpansionOutputSchema = z.object({
  parent_counter_draft_id: z.string().uuid(),
  variants: z.array(ContentVariantSchema).length(4),     // exactly 4: blog + x_thread + linkedin + email
});
```

---

## 4. Pipeline (W7)

`inngest/functions/content-expand.ts`:

1. **Step 1 `load-context`** — fetch parent counter_draft + linked signals + organization brand voice.
2. **Step 2 `expand-blog`** — `generateObject({schema: ContentVariantSchema})` з prompt: "Expand this counter-narrative into a 700-900 word blog post...".
3. **Step 3 `expand-x-thread`** — same pattern: "Adapt as 5-tweet X thread, each ≤280 chars...".
4. **Step 4 `expand-linkedin`** — "200-word LinkedIn post з 3-5 hashtags...".
5. **Step 5 `expand-email`** — "Email format with subject ≤80 chars, preheader ≤120 chars, body ~300 words...".
6. **Step 6 `persist-variants`** — INSERT 4 rows у `content_variants`.
7. **Step 7 `persist-run`** — runs row з stats.

LLM choice: claude-sonnet-4 для blog (longer-form), gpt-4o-mini для соцмедіа (швидше, дешевше).

Cost envelope: ~$0.05 per W7 run (4 LLM calls × ~1k tokens output average).

---

## 5. Approval model

**Hackathon:** parent counter-draft approval auto-triggers W7. Кожен variant отримує `status='generated'`. User може individually mark `status='sent'` коли copy-paste'нув. Reject варіант → `status='archived'`. No re-approval gate per variant.

**Post-hackathon:** per-variant approval workflow. CMO approves overall, channel owner (social media manager / blog editor) approves their channel'у.

---

## 6. Dashboard UX

Reference: `features/dashboard.md §2.7` (новa section).

Layout per parent counter-draft:
- Drafts queue card (existing `features/dashboard.md §2.4`) має accordion "Multi-channel variants (4)".
- Expand → grid of 4 variant cards (blog | x_thread | linkedin | email).
- Кожна card:
  - Channel badge (icon + name).
  - Title/preview (first 200 chars).
  - "Copy as Markdown" button (для X thread copies як numbered list).
  - "Show full" expand → modal з повним body + metadata.
  - Status badge: generated / sent / archived.

---

## 7. Acceptance criteria

### Functional

- [ ] Approve кнопка на counter_draft → W7 Inngest event emitted.
- [ ] Within 60s, 4 content_variants persist'aяться у DB.
- [ ] Dashboard polls (5s interval) and renders 4 variant cards.
- [ ] Кожен variant has correct channel-specific shape (X thread = array of 5 tweets ≤280 chars; email = subject + body; blog = title + body; LinkedIn = body + hashtags).
- [ ] Copy as Markdown copies channel-appropriate format (X thread як numbered list, email як `Subject: ...\n\n{body}`, etc.).
- [ ] Mark as sent flips status, badge updates optimistically.
- [ ] Reject (post-hackathon — for now: skip).

### Non-functional

- [ ] Each LLM call wrapped у `step.run()` для idempotency.
- [ ] If any expand-* step fails after retries — partial persist not allowed (transaction або all-or-nothing INSERT).
- [ ] X thread tweets validated — kожен ≤280 chars (Zod refine).
- [ ] Cost tracked у `runs.stats.cost_usd_cents`.

---

## 8. Cross-references

- DB schema → `brand-intel/CONTRACTS.md §3.X` (content_variants table).
- Zod schemas → `brand-intel/CONTRACTS.md §2.9` (ContentVariantSchema, ContentExpansionOutputSchema).
- Pipeline graph → `brand-intel/PIPELINES.md §W7`.
- Dashboard integration → `brand-intel/features/dashboard.md §2.7`.
- Scope decision → `decisions/2026-04-25-peec-overlay-pivot.md`.
- Counter-draft pipeline (parent) → `brand-intel/PIPELINES.md §W9`.
