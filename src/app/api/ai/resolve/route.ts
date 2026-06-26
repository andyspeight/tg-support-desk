import { z } from "zod";
import { resolveTicket } from "@/lib/ai/resolve";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ ticketId: z.string().uuid() });

// Internal trigger for re-running resolution on a ticket programmatically.
// Agents use the in-app "Run AI" action instead.
export async function POST(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "ticketId (uuid) required" }, { status: 400 });
  }

  try {
    const outcome = await resolveTicket(parsed.data.ticketId, { trigger: "manual" });
    return Response.json({ outcome: outcome?.kind ?? "skipped" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message, note: "ticket fail-safe escalated" }, { status: 500 });
  }
}
