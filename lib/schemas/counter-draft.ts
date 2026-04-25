// W9 auto-counter draft. Per CONTRACTS.md §2.3.
// Severity threshold rule (decisions/2026-04-24-counter-draft-severity-high-only.md):
// auto-generation тільки для signals.severity = 'high'. Medium — on-demand button.
import { z } from "zod";

export const CounterDraftChannel = z.enum(["x", "linkedin", "blog", "multi"]);
export type CounterDraftChannel = z.infer<typeof CounterDraftChannel>;

export const CounterDraftSchema = z.object({
  body: z.string().min(50).max(2000),
  channel_hint: CounterDraftChannel,
  tone_pillar: z.string().min(1),
  reasoning: z.string().min(20),
  // evidence_refs allows non-URL strings (e.g. uuid signal id) per §2.3.
  evidence_refs: z.array(z.string()).min(1),
});
export type CounterDraft = z.infer<typeof CounterDraftSchema>;
