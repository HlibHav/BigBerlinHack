# Hackathon demo — rules

- **Pre-seeded data only.** Під час demo не залежу від live Peec/Tavily latency для critical moments. Peec — committed snapshot file `data/peec-snapshot.json` (refreshed T-2h via Claude Code MCP session). Tavily live дозволено для W9 supplementary fresh news, але fallback — pre-seeded signals. Slack webhook — real send (live demo flex moment). Telli/voice live call — `[DEFERRED — W6 cut, not in demo]`. Source: GAPS.md + `decisions/2026-04-25-mcp-only-peec-attio-demo.md`.
- **Run-through ≥3 times day before.** Wall-time ≤4min validated триразовим повтором. Source: RUNBOOK.md pre-demo checklist.
- **Notifications off.** Slack/Discord/iMessage/laptop autolock — всі вимкнені під час demo. Source: RUNBOOK.md.
- **Tagged release.** `git tag v0.1-hackathon` перед demo. Не push'ай зміни в останній день. Source: RUNBOOK.md.
