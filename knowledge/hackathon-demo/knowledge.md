# Hackathon demo — knowledge

> Все що стосується demo 2026-04-25 в одному місці.

## Shape (2026-04-25 rev — Attio + Peec MCP overlay)

- **2026-04-24:** Full funnel у 4 хвилини. 4 кроки по ≤45с кожен + 15с фінал. Source: README.md "Hackathon demo".
- **2026-04-25 (current):** Sequence (per `decisions/2026-04-25-peec-overlay-pivot.md` + `decisions/2026-04-25-mcp-only-peec-attio-demo.md`): (1) `/demo/attio` opens — show audit panel + Peec brand pulse → (2) "Run radar now" → live W9 trace → new signal (Peec delta або Tavily news) → counter-draft → (3) Approve → W7 auto-spawns 4 channel variants → (4) "Send today's brief now" → real Slack post. Final pitch: "BBH closes the loop Peec doesn't."
- **Was (2026-04-24):** Sequence (1) Live LLM query via W4 widget → (2) Voice brief via Telli → (3) W9 → (4) W5 simulator — superseded. W4 + W6 voice deferred per scope cut.

## Data

- **2026-04-24:** Demo спирається на pre-seeded state. Не залежить від live API latency в критичний момент. Source: README.md + GAPS.md §10.
- **2026-04-25 (current):** Pre-seed склад per `supabase/seed.sql`: Attio organization + 3 competitors (Attio self + Salesforce + HubSpot), `data/peec-snapshot.json` з 7 days brand reports, ≥1 high-severity signal, ≥1 pending counter-draft. Was (2026-04-24): "3 days snapshots, 2 competitor signals, 1 pre-generated counter-draft" + plugin-era `config/demo-brand.yaml` + `state/demo-brand/` — superseded by webapp + Attio demo brand.

## Fallbacks

- **2026-04-25 (current):** Live trigger fails (Inngest Cloud down, OpenAI 5xx) → pre-recorded screen video. Slack webhook fail → show pre-built mock brief preview у dashboard. Was (2026-04-24): "Telli live → pre-recorded audio" — superseded by W6 voice cut.
- **2026-04-24:** Internet primary → phone hotspot backup. Source: RUNBOOK.md.
