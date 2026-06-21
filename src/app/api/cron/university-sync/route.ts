import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { firecrawlMap, firecrawlScrape } from "@/lib/integrations/firecrawl";
import { distilKbFromPage } from "@/lib/ai/copilot";
import { audit, createKbArticle, existingKbSourceUrls, publishKbArticle } from "@/lib/db/queries";
import { embedDocument } from "@/lib/ai/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ingest the Travelgenix University (Duda blog) into the KB via Firecrawl:
// map → scrape (clean markdown) → distil → load, deduped by source URL so it's
// re-runnable. Bounded per run (UNIVERSITY_BATCH) to respect timeouts + cost.
// Manual-trigger for a controlled pilot (Bearer CRON_SECRET); not registered as
// a Vercel cron until validated. Dormant until FIRECRAWL_API_KEY is set.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!env.firecrawlConfigured) return Response.json({ skipped: "firecrawl not configured" });

  try {
    const base = env.universityBaseUrl;
    const host = new URL(base).host;
    const prefix = env.universityPathPrefix;

    const links = await firecrawlMap(base);
    const urls = [...new Set(links)].filter((u) => {
      try {
        const p = new URL(u);
        return p.host === host && (!prefix || p.pathname.startsWith(prefix));
      } catch {
        return false;
      }
    });

    const existing = await existingKbSourceUrls("university");
    const todo = urls.filter((u) => !existing.has(u)).slice(0, env.universityBatch);

    let ingested = 0;
    const errors: string[] = [];
    for (const url of todo) {
      try {
        const page = await firecrawlScrape(url);
        if (page.markdown.trim().length < 80) continue; // skip thin/empty pages
        const { title, body } = await distilKbFromPage(page.markdown, page.title);
        const article = await createKbArticle({
          title,
          body,
          status: env.universityAutopublish ? "draft" : "review",
          source: "university",
          source_url: url,
          source_hash: createHash("sha256").update(page.markdown).digest("hex"),
          created_by: "university-sync",
        });
        if (env.universityAutopublish) {
          await publishKbArticle(article.id, await embedDocument(`${title}\n\n${body}`));
        }
        await audit("system", "university-sync", "kb.ingested", { type: "kb_article", id: article.id }, { url });
        ingested++;
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length) console.error("university-sync errors:", errors);

    return Response.json({
      mapped: urls.length,
      already: existing.size,
      ingested,
      remaining: Math.max(urls.length - existing.size - ingested, 0),
      autopublished: env.universityAutopublish,
      errors: errors.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("university-sync failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
