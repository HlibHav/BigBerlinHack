# Competitive intel — rules

- **No auto-publish.** Counter-drafts завжди INSERT'аться у таблицю `counter_drafts` зі `status = 'draft'`. Only human approval через UI або direct SQL `UPDATE ... SET status = 'approved'`. Source: decisions/2026-04-24-counter-draft-severity-high-only.md. (was: `state/{brand}/counter-drafts/*.md` frontmatter edit — superseded 2026-04-24 з pivot на Supabase).
- **Severity=high only для auto-draft.** Med/low — сигнал INSERT'иться у `signals` з `auto_draft = false`, counter_draft не створюється. Source: decisions/2026-04-24-counter-draft-severity-high-only.md, confirmed 2026-04-24.
- **Source citation required.** Кожен counter-draft має `evidence_refs: string[]` з ≥1 посиланням на original signal (signal UUID + URL + timestamp). Zod schema enforces. Source: Gate B у CLAUDE.md.
- **No competitor PII.** Не збирай/не зберігай приватну інформацію про competitor team members. Тільки публічні handles/URLs. Source: `brand-intel/GAPS.md §6 Brand voice & legal`.
