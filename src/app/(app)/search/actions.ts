"use server";

import { requireAgent } from "@/lib/auth";
import { matchKbArticles, matchTickets, searchTickets } from "@/lib/db/queries";
import { embedQuery } from "@/lib/ai/embeddings";
import type { PastTicketHit, SearchResponse, TicketSearchFilters, TicketSearchHit } from "@/lib/db/types";

/**
 * Powers the instant search box. The ranked, content-aware keyword ticket search
 * always runs; for queries of 3+ chars we embed the query ONCE and fan out to the
 * semantic KB and semantic past-ticket searches in parallel. Fail-soft — a failing
 * side yields empty results for that side, never a blank page.
 */
export async function runSearchAction(query: string, filters: TicketSearchFilters): Promise<SearchResponse> {
  await requireAgent();
  const q = query.trim();
  if (q.length < 2) return { tickets: [], kb: [], pastTickets: [] };

  const keywordTickets = searchTickets(q, filters).catch((error) => {
    console.error("searchTickets failed:", error);
    return [] as TicketSearchHit[];
  });

  const semantic =
    q.length >= 3
      ? (async () => {
          const embedding = await embedQuery(q);
          const [kb, past] = await Promise.all([matchKbArticles(embedding, 6), matchTickets(embedding, 6)]);
          return { kb, past };
        })().catch((error) => {
          console.error("semantic search failed:", error);
          return { kb: [], past: [] as PastTicketHit[] };
        })
      : Promise.resolve({ kb: [], past: [] as PastTicketHit[] });

  const [tickets, { kb, past }] = await Promise.all([keywordTickets, semantic]);

  return {
    tickets,
    kb: kb.map((m) => ({
      id: m.id,
      title: m.title,
      snippet: m.body.slice(0, 220).trim(),
      url: m.source_url ?? null,
      similarity: m.similarity,
    })),
    pastTickets: past,
  };
}
