# Peec integration — rules

> **2026-04-25 update:** Hackathon Peec strategy = MCP-only via Claude Code session, persisted у `data/peec-snapshot.json`. NO live REST calls from server-side per `decisions/2026-04-25-mcp-only-peec-attio-demo.md`. Rules below preserved для post-hackathon Enterprise tier scenario; today's "Peec call" = local snapshot file read через `lib/services/peec-snapshot.ts` (not network call).

- **Pre-call budget check.** `[POST-HACKATHON]` Перед кожним Peec call перевіряй поточний weekly-spent у `cost_ledger`. Якщо over budget — skip + log skip-reason. Не надсилай request. Source: GAPS.md §4. (Hackathon: snapshot file load — no per-call cost.)
- **Cache agnostic parameters.** Prompt caching працює — пасивно користуйся тим самим формулюванням prompt'ів по run'ах, щоб Anthropic side-caching допомагав. Source: GAPS.md §4.
- **No mock in tests.** `[POST-HACKATHON]` Integration tests б'ють реальний Peec через test-brand. Unit tests — без Peec. Hackathon: tests run проти committed `data/peec-snapshot.json` fixture. Source: README.md + GAPS.md §2.
- **Snapshot file as ground truth.** `[HACKATHON]` Server-side W9 reads через `lib/services/peec-snapshot.ts` loader, parses через `PeecSnapshotFileSchema` (CONTRACTS §6.1). Refresh — manual via Claude Code session ("refresh peec snapshot" command), per `RUNBOOK.md §1.5`. Source: `decisions/2026-04-25-mcp-only-peec-attio-demo.md`.
