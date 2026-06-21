import "server-only";
import { env } from "@/lib/env";

// Thin Firecrawl client — site mapping + clean-markdown scraping for KB ingest.
const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

async function firecrawl(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${FIRECRAWL_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.firecrawlApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firecrawl ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** List a site's URLs (sitemap-aware). */
export async function firecrawlMap(url: string): Promise<string[]> {
  const data = (await firecrawl("/map", { url })) as { links?: unknown[] };
  return (data.links ?? [])
    .map((l) => (typeof l === "string" ? l : ((l as { url?: string }).url ?? "")))
    .filter(Boolean);
}

export type ScrapedPage = { markdown: string; title: string | null };

/** Scrape one URL to clean main-content markdown. */
export async function firecrawlScrape(url: string): Promise<ScrapedPage> {
  const data = (await firecrawl("/scrape", { url, formats: ["markdown"], onlyMainContent: true })) as {
    data?: { markdown?: string; metadata?: { title?: string } };
  };
  return { markdown: data.data?.markdown ?? "", title: data.data?.metadata?.title ?? null };
}
