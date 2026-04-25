// W9 competitor radar signal contract. Per CONTRACTS.md §2.2.
// `peec_delta` source_type added per decisions/2026-04-25-peec-overlay-pivot.md
// для signals derived from data/peec-snapshot.json delta detection.
import { z } from "zod";

export const SignalSourceType = z.enum([
  "competitor",
  "internal",
  "external",
  "peec_delta",
]);
export type SignalSourceType = z.infer<typeof SignalSourceType>;

export const SignalSeverity = z.enum(["low", "med", "high"]);
export type SignalSeverity = z.infer<typeof SignalSeverity>;

export const SignalSentiment = z.enum(["positive", "neutral", "negative"]);
export type SignalSentiment = z.infer<typeof SignalSentiment>;

export const SignalSchema = z.object({
  source_type: SignalSourceType,
  source_url: z.string().url(),
  severity: SignalSeverity,
  sentiment: SignalSentiment,
  summary: z.string().min(20).max(500),
  reasoning: z.string().min(20),
  evidence_refs: z.array(z.string().url()).min(1),
});
export type Signal = z.infer<typeof SignalSchema>;
