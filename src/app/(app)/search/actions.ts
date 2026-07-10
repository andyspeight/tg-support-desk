"use server";

import { requireAgent } from "@/lib/auth";
import { searchTickets } from "@/lib/db/queries";
import { searchKb } from "@/lib/ai/kb-search";
import type { SearchResponse, TicketSearchFilters, TicketSearchHit } from "@/lib/db/types";

/**
 * Powers the instant search box. Runs the ranked, content-aware ticket search
 * and (for queries of 3+ chars) a semantic KB search in parallel. Fail-soft:
 * either side failing yields empty results for that side rather than an error,
 * so a hiccup never blanks the whole page.
 */
export async function runSearchAction(query: string, filters: TicketSearchFilters): Promise<SearchResponse> {
  await requireAgent();
  const q = query.trim();
  if (q.length < 2) return { tickets: [], kb: [] };

  const [tickets, kb] = await Promise.all([
    searchTickets(q, filters).catch((error) => {
      console.error("searchTickets failed:", error);
      return [] as TicketSearchHit[];
    }),
    // Semantic KB (vector + rerank) — one embed call, so skip very short queries.
    (q.length >= 3 ? searchKb(q, 6) : Promise.resolve([])).catch((error) => {
      console.error("searchKb failed:", error);
      return [];
    }),
  ]);

  return {
    tickets,
    kb: kb.map((m) => ({
      id: m.id,
      title: m.title,
      snippet: m.body.slice(0, 220).trim(),
      url: m.source_url ?? null,
      similarity: m.similarity,
    })),
  };
}
