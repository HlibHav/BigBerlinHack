// W5 narrative simulator output. Per CONTRACTS.md §2.5.
// Score formula: score = mention_rate × (1 / avg_position) normalized [0, 1].
// Якщо avg_position = null (brand never mentioned) → score = 0.
import { z } from "zod";

import { SignalSentiment } from "./signal";

export const NarrativeVariantSchema = z.object({
  rank: z.number().int().min(1).max(5),
  body: z.string().min(50).max(1500),
  score: z.number().min(0).max(1),
  score_reasoning: z.string().min(20),
  predicted_sentiment: SignalSentiment,
  // null коли brand не з'явився у any test prompt; positive number otherwise.
  avg_position: z.number().min(1).nullable(),
  mention_rate: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).min(1),
});
export type NarrativeVariant = z.infer<typeof NarrativeVariantSchema>;

export const SimulatorOutputSchema = z.object({
  variants: z.array(NarrativeVariantSchema).min(1).max(5),
  seed_echo: z.string(),
});
export type SimulatorOutput = z.infer<typeof SimulatorOutputSchema>;
