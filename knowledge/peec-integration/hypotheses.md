# Peec integration — hypotheses

> Untested припущення. Підтверджена 3 рази → промоут до knowledge.md. Або демоут якщо empirically falsified.

## Active

- **2026-04-25:** *Peec native MCP server exposes ту саму three-metric surface (visibility/position/sentiment) як Peec UI does.* Не verified. Якщо MCP exposes тільки subset (наприклад, raw snapshot data без aggregated metrics), ми б мусили ourselves aggregate. Confirm через actual MCP call коли activate'имо post-hackathon.

- **2026-04-25:** *Community MCP server `mcp-server-peecai` (thein-art/mcp-server-peecai) ще maintained та працює з current Peec API.* GitHub repo не перевірений на activity. Перед використанням — check last commit + open issues.

- **2026-04-25:** *Citation tracking includes URL + domain + frequency, не тільки flat URL list.* Реview articles натякають на authority-grade tracking. Verify через actual integration.

## Demoted / disproven

- ~~**2026-04-24:** *500 req/day — реальний tier limit.*~~ **DISPROVEN 2026-04-25** через peec.ai/pricing — no free tier, Starter €85/mo з 50 tracked prompts (не requests). Перенесено у `knowledge.md`.

- **2026-04-25:** *Response latency <3s steady state* — STILL ACTIVE hypothesis (Peec REACTIVATED у hackathon scope per `decisions/2026-04-25-peec-overlay-pivot.md`). Real measurement через hyperfine benchmark одразу під час bootstrap'а Peec MCP integration. Якщо >3s consistent — review caching strategy + budget scope.

- ~~**2026-04-24:** *Citation URL field завжди не пустий.*~~ Without real Peec response shape ще не verified. Move до active hypotheses вище у updated form.
