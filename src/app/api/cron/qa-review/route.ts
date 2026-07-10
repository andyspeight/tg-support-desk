import { runQaReviews } from "@/lib/ai/qa-review";
import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Independent QA of AI-sent replies: grades each against policy/grounding/voice
// and flags failures for a human. The safety net behind the auto-send bar.
// Dormant until the Anthropic key is configured.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  if (!env.anthropicConfigured) return Response.json({ skipped: "anthropic not configured" });

  try {
    return Response.json(await runQaReviews());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("qa-review failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
