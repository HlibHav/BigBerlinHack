// Onboarding + W9 input list of competitors. Per CONTRACTS.md §2.7.
// relationship='self' enables crisis-comms self-monitoring through same machinery.
import { z } from "zod";

export const CompetitorRelationship = z.enum(["self", "competitor"]);
export type CompetitorRelationship = z.infer<typeof CompetitorRelationship>;

export const CompetitorSchema = z.object({
  display_name: z.string().min(1).max(120),
  relationship: CompetitorRelationship,
  homepage_url: z.string().url().nullable(),
  handles: z.record(z.string()).default({}),
  search_terms: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
});
export type Competitor = z.infer<typeof CompetitorSchema>;
