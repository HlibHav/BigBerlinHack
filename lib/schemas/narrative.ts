// W4 public widget narrative. Per CONTRACTS.md §2.4.
// [DEFERRED — W4 widget cut by hackathon scope, schema preserved for post-hackathon]
import { z } from "zod";

export const NarrativeSchema = z.object({
  summary_markdown: z.string().min(100).max(3000),
  highlighted_themes: z.array(z.string().min(3)).min(1).max(5),
  citation_ids: z.array(z.string().uuid()).min(1),
});
export type Narrative = z.infer<typeof NarrativeSchema>;
