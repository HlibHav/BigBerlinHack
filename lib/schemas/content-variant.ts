// W7 multi-channel expansion output. Per CONTRACTS.md §2.6.
// Exactly 4 variants per parent counter-draft: blog + x_thread + linkedin + email.
// Per-channel metadata refines:
//   blog: { meta_description, slug_suggestion }
//   x_thread: { tweets: string[] }    -- each ≤280 chars
//   linkedin: { hashtags: string[] }
//   email: { subject, preheader }
import { z } from "zod";

export const ContentChannel = z.enum(["blog", "x_thread", "linkedin", "email"]);
export type ContentChannel = z.infer<typeof ContentChannel>;

const BlogMetadataSchema = z.object({
  meta_description: z.string().min(1),
  slug_suggestion: z.string().min(1),
});

const XThreadMetadataSchema = z.object({
  tweets: z
    .array(z.string().min(1).max(280))
    .min(1, "x_thread must have at least one tweet"),
});

const LinkedInMetadataSchema = z.object({
  hashtags: z.array(z.string().min(1)),
});

const EmailMetadataSchema = z.object({
  subject: z.string().min(1),
  preheader: z.string().min(1),
});

export const ContentVariantSchema = z
  .object({
    channel: ContentChannel,
    title: z.string().min(5).max(120).nullable(),
    body: z.string().min(50),
    metadata: z.record(z.unknown()).default({}),
    evidence_refs: z.array(z.string()).min(1),
  })
  .superRefine((variant, ctx) => {
    // Title null required для x_thread/linkedin/email; blog може мати title.
    if (variant.channel !== "blog" && variant.title !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `title must be null for channel "${variant.channel}"`,
        path: ["title"],
      });
    }

    // Channel-specific metadata shape.
    let metaResult: z.SafeParseReturnType<unknown, unknown>;
    switch (variant.channel) {
      case "blog":
        metaResult = BlogMetadataSchema.safeParse(variant.metadata);
        break;
      case "x_thread":
        metaResult = XThreadMetadataSchema.safeParse(variant.metadata);
        break;
      case "linkedin":
        metaResult = LinkedInMetadataSchema.safeParse(variant.metadata);
        break;
      case "email":
        metaResult = EmailMetadataSchema.safeParse(variant.metadata);
        break;
    }
    if (!metaResult.success) {
      for (const issue of metaResult.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `metadata invalid for ${variant.channel}: ${issue.message}`,
          path: ["metadata", ...issue.path],
        });
      }
    }
  });
export type ContentVariant = z.infer<typeof ContentVariantSchema>;

export const ContentExpansionOutputSchema = z
  .object({
    parent_counter_draft_id: z.string().uuid(),
    variants: z.array(ContentVariantSchema).length(4),
  })
  .superRefine((output, ctx) => {
    // Hackathon invariant: each of 4 channels must appear exactly once.
    const seen = new Set<string>();
    for (const [i, v] of output.variants.entries()) {
      if (seen.has(v.channel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate channel "${v.channel}" in variants`,
          path: ["variants", i, "channel"],
        });
      }
      seen.add(v.channel);
    }
    const required: Array<z.infer<typeof ContentChannel>> = [
      "blog",
      "x_thread",
      "linkedin",
      "email",
    ];
    for (const ch of required) {
      if (!seen.has(ch)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `missing required channel "${ch}"`,
          path: ["variants"],
        });
      }
    }
  });
export type ContentExpansionOutput = z.infer<typeof ContentExpansionOutputSchema>;
