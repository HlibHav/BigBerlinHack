# BBH — Brand Intelligence Agent

[![Vercel](https://img.shields.io/badge/Vercel-deployed-success?logo=vercel&logoColor=white)](https://bbh-brown.vercel.app/demo/attio)
[![CI](https://github.com/HlibHav/BigBerlinHack/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HlibHav/BigBerlinHack/actions/workflows/ci.yml)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Inngest](https://img.shields.io/badge/Inngest-cloud-blueviolet?logo=inngest&logoColor=white)](https://inngest.com)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-D97757?logo=anthropic&logoColor=white)](https://claude.com/claude-code)

> **Your brand is being shaped by AI models right now.** BBH monitors how LLMs describe you vs competitors, classifies the gaps, writes counter-narratives, and ships them across channels — while you sleep.

**Live demo:** [bbh-brown.vercel.app/demo/attio](https://bbh-brown.vercel.app/demo/attio) — Attio vs Salesforce & HubSpot, no login required.

Built for [Peec MCP Challenge](https://peec.ai) at **Big Berlin Hack 2026-04-25/26** · Track: Peec AI · 3 partner technologies: **Tavily + Google Gemini + Gradium** · Side challenge: **Aikido** (security)

---

## What it does

Most brands have no idea how ChatGPT, Claude, or Gemini describes them when a buyer asks *"what's the best CRM for a growing SaaS startup?"*. BBH closes that loop.

**Five automated pipelines:**

**Competitor Radar (W9)** runs every 6 hours. Pulls brand visibility data from Peec — mention rates, share of voice, sentiment, position rankings — and supplements with live Tavily news. Classifies each signal as high / medium / low severity. High-severity signals automatically get a counter-draft written.

**Narrative Simulator (W5)** takes a competitor move or any seed prompt and generates 3–5 ranked counter-narratives. Each variant is generated по distinct angle (data model / migration / API DX / pricing / speed / specialization), scored by a Sonnet-4.5 judge on four dimensions, then ranked. Not "here's the best answer" — here's why each one ranks differently, with a body-aware quality score.

**Multi-Channel Expand (W7)** takes one approved counter-draft and expands it into three ready-to-publish formats: long-form blog post, X thread, and LinkedIn update. Triggered automatically on approval.

**Morning Brief (W6′)** sends a 200-word Slack summary every morning at 8am UTC — yesterday's signal delta, top counter-draft performance, what moved overnight.

**Podcast Prep (W11)** is our differentiation play — when the founder is invited to a podcast, BBH generates a retrieval-optimized brief: 5–7 talking points with self-rated retrievability, 6–10 anticipated host Q&A, brand-drop moments, topics-to-avoid (sourced from open W9 high-severity signals), and per-competitor mention strategy. Why this matters: a podcast transcript publishes across 5–10 surfaces (Spotify show notes, YouTube auto-captions, host site, Apple Podcasts, aggregators), all crawled by AI engines — one episode = 6–12 months of retrievable visibility tail. Click **🔊 Preview voice** on any talking point to hear it spoken aloud (Gradium TTS) before recording.

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
| Live news + research | **Tavily** search API (W9 fresh news, W11 previous-episode fetch, W5 phrase-availability) |
| LLMs | OpenAI GPT-4o (Q&A + brand drops) + Anthropic Claude Sonnet 4.5 (talking points + judge) + **Google Gemini 2.5 Flash** (W11 structural sections — 10× cheaper) |
| Voice | **Gradium** TTS — preview talking points spoken aloud (W11) |
| Security | **Aikido** — connected to repo for SAST + dependency scanning |
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

## Big Berlin Hack — submission compliance

**Track:** Peec AI · "0 → 1 AI Marketer" · brand: **Attio** vs Salesforce + HubSpot

**Three partner technologies (per BBH rules):**

1. **Tavily** — three pipelines lean on Tavily search:
   - W9 competitor radar pulls fresh competitor news to supplement Peec snapshot deltas (`inngest/functions/competitor-radar.ts`).
   - W5 pre-launch check runs phrase-availability detection — does any competitor already own a positioning phrase the founder wants to claim (`inngest/functions/prelaunch-check.ts`).
   - W11 podcast prep optionally fetches host's previous-episode pages for tone calibration (`inngest/functions/podcast-prep.ts`).

2. **Google Gemini** (Google DeepMind) — `lib/services/gemini.ts` wraps `gemini-2.5-flash` for the W11 structural sections (avoidance list + competitor mention strategy). Gemini Flash costs ~10× less than gpt-4o and matches the quality bar for these schematic sections, while talking points + Q&A stay on premium models. Cost ledger logs usage per call.

3. **Gradium** — `lib/services/gradium.ts` wraps the Gradium TTS endpoint. The W11 brief detail page renders a **🔊 Preview voice** button per talking point — the founder can hear how a suggested line sounds spoken aloud before they sit in front of the host's mic. Direct hit on Gradium's "voice AI for realtime interactions" framing applied to the spoken-word brand surface.

**Side challenge: Aikido (Most Secure Build)** — repo is connected to Aikido scanning. Security report screenshot included in submission.

**Newly-built scope (everything beyond commit `e30c5e7531`):**
- W11 podcast-prep pipeline (10-step Inngest function, Sonnet+gpt-4o+Gemini hybrid, Gradium voice preview)
- W5 narrative simulator refactor — angle taxonomy, parallel calls, judge-based scoring (replaces 30-call ranking-prompt scoring with 1-call Sonnet judge)
- 3-layer eval suite (deterministic diversity + LLM brand-voice judge + scoring sensitivity probe) under `evals/`
- Shared brand voice forbidden-phrases module (lib/brand) — DRY between simulator + evals + judge prompts
- Competitive analysis (`brand-intel/feedback/competitor-builds-2026-04-26.md`) of two MCP Challenge entries we observed
- Per-pipeline feature spec under `brand-intel/features/podcast-prep.md` + ADR

**Project deliverables for the jury:**
- Public repo: https://github.com/HlibHav/BigBerlinHack
- Live deploy: https://bbh-brown.vercel.app/demo/attio
- 2-min demo video: see submission form
- Eval baseline + post-fix reports under `evals/reports/` (committed)

**Differentiation message:**

> Other Peec MCP Challenge entries we saw measure brand visibility (ZipTie note-taking benchmark) or build setup workflows (live AI Skill build session). BBH **closes the loop** — when a competitor moves, we don't just see it, we classify severity, draft a counter-narrative, simulate ranked variants with a body-aware judge, expand into four written channels, deliver a morning brief — and prepare the founder for high-impact spoken moments (podcast appearances) that generate lasting AI-retrievable transcripts. Five pipelines, one signal flow, end-to-end measurable.

---

## License

MIT
