import "server-only";
import { matchKbArticles, type KbMatch } from "@/lib/db/queries";
import { embedQuery, rerank } from "./embeddings";

// Two-stage KB retrieval: vector-retrieve broad, then rerank for true relevance
// before the agent (or copilot) reads — the lever that lifts answer quality
// across the board. Fail-open: any rerank error falls back to vector order.

const RETRIEVE = 20;

export async function searchKb(query: string, count = 5): Promise<KbMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const matches = await matchKbArticles(await embedQuery(trimmed), RETRIEVE);
  if (matches.length <= count) return matches;

  try {
    const ranked = await rerank(trimmed, matches.map((m) => `${m.title}\n${m.body.slice(0, 2000)}`));
    if (ranked.length === 0) return matches.slice(0, count);
    return ranked
      .slice(0, count)
      .map((r) => matches[r.index])
      .filter((m): m is KbMatch => Boolean(m));
  } catch (error) {
    console.error("searchKb rerank fallback:", error);
    return matches.slice(0, count);
  }
}
