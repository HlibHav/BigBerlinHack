// LLM raw snapshot (W4 narrative input). Per CONTRACTS.md §2.1.
// citations capped at 500 chars excerpt to keep evidence rows lean.
import { z } from "zod";

export const SnapshotCitationSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  excerpt: z.string().max(500),
});
export type SnapshotCitation = z.infer<typeof SnapshotCitationSchema>;

export const SnapshotSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  response_text: z.string().min(1),
  citations: z.array(SnapshotCitationSchema).min(1),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
