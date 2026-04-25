// Peec snapshot file shape. Per CONTRACTS.md §6.1.
// Loaded by lib/services/peec-snapshot.ts from data/peec-snapshot.json.
// Snapshot file committed у git (not secret); refresh manual via Claude Code MCP.
import { z } from "zod";

export const PeecBrandSchema = z.object({
  id: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
  aliases: z.array(z.string()),
  is_own: z.boolean(),
});
export type PeecBrand = z.infer<typeof PeecBrandSchema>;

export const PeecBrandReportRowSchema = z.object({
  brand_id: z.string(),
  brand_name: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  visibility: z.number().min(0).max(1),
  mention_count: z.number().int().nonnegative(),
  share_of_voice: z.number().min(0).max(1),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  position: z.number().min(1).max(20).nullable(),
});
export type PeecBrandReportRow = z.infer<typeof PeecBrandReportRowSchema>;

export const PeecChatSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
});
export type PeecChatSource = z.infer<typeof PeecChatSourceSchema>;

export const PeecChatSchema = z.object({
  id: z.string(),
  prompt_id: z.string(),
  model_id: z.string(),
  date: z.string().datetime(),
  messages: z.array(z.unknown()),
  brands_mentioned: z.array(z.string()),
  sources: z.array(PeecChatSourceSchema),
});
export type PeecChat = z.infer<typeof PeecChatSchema>;

export const PeecUrlReportRowSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  citation_count: z.number().int().nonnegative(),
  retrievals: z.number().int().nonnegative(),
  mentioned_brand_ids: z.array(z.string()),
});
export type PeecUrlReportRow = z.infer<typeof PeecUrlReportRowSchema>;

export const PeecActionGroup = z.enum(["owned", "editorial", "reference", "ugc"]);
export type PeecActionGroup = z.infer<typeof PeecActionGroup>;

export const PeecActionSchema = z.object({
  text: z.string(),
  group_type: PeecActionGroup,
  opportunity_score: z.number().min(0).max(1),
});
export type PeecAction = z.infer<typeof PeecActionSchema>;

export const PeecPromptSchema = z.object({
  id: z.string(),
  text: z.string(),
  country_code: z.string().length(2),
});
export type PeecPrompt = z.infer<typeof PeecPromptSchema>;

export const PeecSnapshotFileSchema = z.object({
  captured_at: z.string().datetime(),
  project_id: z.string(),
  brands: z.array(PeecBrandSchema),
  prompts: z.array(PeecPromptSchema),
  brand_reports: z.array(PeecBrandReportRowSchema).min(1),
  chats: z.array(PeecChatSchema),
  url_report: z.array(PeecUrlReportRowSchema),
  actions: z.array(PeecActionSchema),
});
export type PeecSnapshotFile = z.infer<typeof PeecSnapshotFileSchema>;
