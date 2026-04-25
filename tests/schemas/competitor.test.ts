import { describe, it, expect } from "vitest";

import { CompetitorSchema } from "@/lib/schemas/competitor";

describe("CompetitorSchema", () => {
  it("parses valid competitor з all fields", () => {
    const parsed = CompetitorSchema.parse({
      display_name: "HubSpot",
      relationship: "competitor",
      homepage_url: "https://hubspot.com",
      handles: { twitter: "hubspot", linkedin: "hubspot" },
      search_terms: ["hubspot crm", "hubspot pricing"],
      is_active: true,
    });
    expect(parsed.display_name).toBe("HubSpot");
    expect(parsed.handles.twitter).toBe("hubspot");
  });

  it("applies defaults для optional fields", () => {
    const parsed = CompetitorSchema.parse({
      display_name: "Attio",
      relationship: "self",
      homepage_url: null,
    });
    expect(parsed.handles).toEqual({});
    expect(parsed.search_terms).toEqual([]);
    expect(parsed.is_active).toBe(true);
  });

  it("rejects invalid relationship value", () => {
    const result = CompetitorSchema.safeParse({
      display_name: "X",
      relationship: "partner",
      homepage_url: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty display_name", () => {
    const result = CompetitorSchema.safeParse({
      display_name: "",
      relationship: "competitor",
      homepage_url: null,
    });
    expect(result.success).toBe(false);
  });
});
