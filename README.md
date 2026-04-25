# BBH — Brand Intelligence Agent

> **Your brand is being shaped by AI models right now.** BBH monitors how LLMs describe you vs competitors, classifies the gaps, writes counter-narratives, and ships them across channels — while you sleep.

**Live demo:** [bbh-brown.vercel.app/demo/attio](https://bbh-brown.vercel.app/demo/attio) — Attio vs Salesforce & HubSpot, no login required.

Built for [Peec MCP Challenge](https://peec.ai) · Hackathon 2026-04-25

---

## What it does

Most brands have no idea how ChatGPT, Claude, or Gemini describes them when a buyer asks *"what's the best CRM for a growing SaaS startup?"*. BBH closes that loop.

**Four automated pipelines:**

**Competitor Radar (W9)** runs every 6 hours. Pulls brand visibility data from Peec — mention rates, share of voice, sentiment, position rankings — and supplements with live Tavily news. Classifies each signal as high / medium / low severity. High-severity signals automatically get a counter-draft written.

**Narrative Simulator (W5)** takes a competitor move or any seed prompt and generates 3–5 ranked counter-narratives. Each variant is scored by simulating how it performs across LLM panels. Not "here's the best answer" — here's why each one ranks differently.

**Multi-Channel Expand (W7)** takes one approved counter-draft and expands it into four ready-to-publish formats: long-form blog post, X thread, LinkedIn update, and email. Triggered automatically on approval.

**Morning Brief (W6′)** sends a 200-word Slack summary every morning at 8am UTC — yesterday's signal delta, top counter-draft performance, what moved overnight.

All pipelines require human approval before anything goes public. Every artifact carries an evidence chain: Peec snapshot timestamp + source URL, so you know exactly why a recommendation was generated.

---

## Stack

| | |
|---|---|
| Frontend | Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui |
| Deploy | Vercel |
| Database | Supabase (Postgres + pgvector), eu-west-1 |
| Orchestration | Inngest step functions |
| Brand data | Peec MCP — AI brand visibility tracking |
| Live news | Tavily search API |
| LLMs | OpenAI GPT-4o + Anthropic Claude Sonnet |
| Alerts | Slack incoming webhook |

---

## Demo walkthrough

Open [bbh-brown.vercel.app/demo/attio](https://bbh-brown.vercel.app/demo/attio) on your phone.

The dashboard shows Attio's current position across AI models vs Salesforce and HubSpot: visibility scores, sentiment, where Attio ranks when buyers ask CRM questions.

Click any counter-draft to see the evidence trail — which Peec signal triggered it, what the sentiment delta was, what sources the AI cited.

Hit **Approve** → W7 fires → four channel-ready variants appear in ~30 seconds.

Hit **Send brief now** → a real Slack message posts to the demo channel.

Hit **Run radar now** → watch the Inngest step trace live — fetch → classify → draft — a new signal appears in the feed.

---

## Local setup

```bash
pnpm install
cp .env.example .env.local   # fill in your keys
pnpm dev
```

You'll need: Supabase project (eu-west-1), OpenAI + Anthropic API keys, Tavily key, Slack incoming webhook, Inngest account.

Full setup → `brand-intel/RUNBOOK.md`.

---

## Project structure

```
app/
  demo/[brand]/     # public dashboard, no auth
  api/inngest/      # Inngest serve endpoint
  actions/          # server actions (radar, simulator, brief, counter-draft)
inngest/functions/  # W9 competitor-radar, W7 content-expand, W5 simulator, W6′ morning-brief
lib/
  schemas/          # Zod schemas for every LLM output boundary
  services/         # Tavily, OpenAI, Anthropic, Slack, Peec snapshot, cost ledger
  supabase/         # typed client + server clients
components/
  dashboard/        # 11 components, all sections of the demo dashboard
data/
  peec-snapshot.json  # Peec brand intelligence data (Attio, Salesforce, HubSpot)
supabase/
  migrations/       # schema + seed
```

---

## How the Peec integration works

Peec tracks how AI models respond to brand-relevant prompts daily — visibility, share of voice, sentiment, position. BBH reads a snapshot of this data (pulled via [Peec MCP](https://docs.peec.ai/mcp)) and uses it as the signal source for W9.

The snapshot lives at `data/peec-snapshot.json` and is refreshed manually. This keeps the demo fully functional without a live API dependency.

---

## License

MIT
