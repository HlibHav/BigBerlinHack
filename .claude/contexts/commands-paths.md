# Commands + Key Paths

> Lazy-loaded коли user prompt згадує: command, deploy, vercel, supabase command, key path, file structure, where, location, project layout

## Commands

```bash
# Local dev
pnpm dev                      # Next.js dev server
pnpm dlx inngest-cli dev      # Inngest local UI
supabase start                # Local Supabase
supabase db reset             # Reset + apply all migrations + seed

# Types & validation
pnpm typecheck                # tsc --noEmit
pnpm lint                     # eslint
pnpm types:gen                # supabase gen types

# Tests
pnpm test                     # vitest run
pnpm test:watch               # vitest watch
pnpm test:e2e                 # playwright

# Migrations
supabase migration new {name} # create migration
supabase db push              # apply to linked project

# Deploy
vercel                        # preview deploy
vercel --prod                 # production deploy
```

---

## Key Paths

```
app/
  api/
    inngest/route.ts             # Inngest serve endpoint
    webhooks/
      telli/route.ts             # Telli voice-agent callbacks
      peec/route.ts              # Peec push notifications (if supported)
  demo/[brand]/page.tsx          # Public demo dashboard
  widget/[brand]/page.tsx        # Embeddable iframe widget
  layout.tsx                     # Root layout
inngest/
  client.ts                      # Inngest client setup
  functions/
    morning-brief.ts             # W6′ Slack send (ACTIVE). W6 voice path [DEFERRED]
    competitor-radar.ts          # W9 (ACTIVE)
    narrative-simulator.ts       # W5 (ACTIVE)
    content-expand.ts            # W7 multi-channel (ACTIVE)
    widget-regenerate.ts         # W4 refresh [DEFERRED]
lib/
  events.ts                      # Zod schemas for Inngest events
  schemas/                       # Zod schemas for LLM outputs
    snapshot.ts
    signal.ts
    counter-draft.ts
    narrative.ts
  supabase/
    client.ts                    # Browser client
    server.ts                    # Server client (service role)
    types.ts                     # Generated types
  services/                      # External service wrappers
    peec-snapshot.ts             # JSON loader (NOT live REST)
    tavily.ts
    openai.ts
    anthropic.ts
    slack.ts
    cost.ts                      # cost_ledger writer
components/
  ui/                            # shadcn/ui components
  widget/                        # W4 components
  dashboard/                     # /demo components
supabase/
  migrations/*.sql
  seed.sql
data/
  peec-snapshot.json             # Peec brand reports snapshot (committed)
brand-intel/
  README.md                      # webapp vision, scope, demo URL, map
  ARCHITECTURE.md                # topology, request flow, pipeline architecture
  CONTRACTS.md                   # Zod schemas, DDL, API routes, webhook signatures
  PIPELINES.md                   # per-pipeline (W4/W5/W6/W9) deep dive
  RUNBOOK.md                     # ops, deploy, rollback, demo-day checklist
  CLI-TOOLS.md                   # pnpm/supabase/vercel/inngest cheatsheet
  GAPS.md                        # known failure modes + resolutions
  _archive/                      # plugin-era docs, superseded
decisions/                       # ADRs
knowledge/                       # semantic memory (INDEX.md + domain folders)
.claude/contexts/                # lazy-loaded CLAUDE.md modules (this dir)
```
