import { drainOutreach } from "@/lib/channels/outreach-send";
import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Drains queued "to all clients" proactive outreach a paced batch at a time, so
// a ~300-recipient send stays within Gmail's rate limit and never times out.
// Small sends go inline from the action and never reach here.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  if (!env.gmailConfigured) return Response.json({ skipped: "gmail not configured" });

  try {
    return Response.json(await drainOutreach());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("send-outreach failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
