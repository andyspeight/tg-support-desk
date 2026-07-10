import { embedResolvedTickets } from "@/lib/ai/ticket-embeddings";
import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Backfills and keeps up embeddings for resolved/closed tickets so they're
// findable by meaning in search. Dormant (no-op) until Voyage is configured.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  if (!env.voyageConfigured) return Response.json({ skipped: "voyage not configured" });

  try {
    return Response.json(await embedResolvedTickets());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("embed-tickets failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
