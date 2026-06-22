import { env } from "@/lib/env";
import { listKbArticles, publishKbArticle, audit } from "@/lib/db/queries";
import { embed } from "@/lib/ai/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Small batches: a 40-doc request (~26K tokens) blows past Voyage's free-tier
// token-per-minute ceiling on the first call (429), so nothing publishes. Eight
// (~5K tokens) clears the free limit and drains in bites across cron runs; once
// the account is on pay-as-you-go it sails through and a run drains the lot.
const BATCH = 8;
const TIME_BUDGET_MS = 270_000;

// One-time bulk publish of the seeded KB: embed every reviewed article (Voyage)
// and flip it to published so the ask box + resolution agent can retrieve it.
// Idempotent — only touches status='review', so re-runs drain whatever's left.
// Bearer CRON_SECRET (Vercel cron). Remove the schedule once the queue is drained.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const started = Date.now();
  const review = await listKbArticles("review"); // up to 200, newest first
  let published = 0;
  const errors: string[] = [];

  for (let i = 0; i < review.length; i += BATCH) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const slice = review.slice(i, i + BATCH);
    try {
      const vectors = await embed(
        slice.map((a) => `${a.title}\n\n${a.body}`),
        "document",
      );
      for (let j = 0; j < slice.length; j++) {
        await publishKbArticle(slice[j].id, vectors[j]);
        published++;
      }
    } catch (err) {
      // A batch failure is usually systemic (Voyage down/misconfigured) — stop
      // rather than hammer the queue, and surface it in the response.
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  if (published > 0) {
    await audit("system", "kb-publish", "kb.bulk_published", undefined, { published });
  }
  if (errors.length) console.error("kb-publish errors:", errors);

  return Response.json({
    candidates: review.length,
    published,
    remaining: review.length - published,
    errors: errors.slice(0, 3),
  });
}
