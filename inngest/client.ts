import { EventSchemas, Inngest } from "inngest";
import { events } from "@/lib/events";

/**
 * BBH Inngest client.
 *
 * Per CONTRACTS.md §1: events validated at compile-time (TS) + runtime (Inngest parses
 * via Zod schemas in lib/events.ts).
 *
 * App ID `bbh` — must match what registers in Inngest cloud dashboard.
 */
export const inngest = new Inngest({
  id: "bbh",
  schemas: new EventSchemas().fromZod(events),
});
