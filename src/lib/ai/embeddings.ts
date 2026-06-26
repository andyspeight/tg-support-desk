import "server-only";
import { env } from "@/lib/env";

// Voyage AI embeddings (Anthropic's recommended pairing for RAG).
// Dimension is fixed at 1024 to match kb_articles.embedding vector(1024).

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

export const EMBEDDING_DIMENSIONS = 1024;

export async function embed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.embeddingModel,
      input: texts,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Voyage embeddings: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "query");
  return vector;
}

export async function embedDocument(text: string): Promise<number[]> {
  const [vector] = await embed([text], "document");
  return vector;
}

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";

/** Rerank documents against a query (Voyage reranker). Returns indices into the
 *  original `documents` array, best first. Used to sharpen KB retrieval. */
export async function rerank(query: string, documents: string[]): Promise<{ index: number; score: number }[]> {
  if (documents.length === 0) return [];
  const res = await fetch(VOYAGE_RERANK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: env.rerankModel, query, documents, top_k: documents.length }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Voyage rerank: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { index: number; relevance_score: number }[] };
  return data.data.map((d) => ({ index: d.index, score: d.relevance_score })).sort((a, b) => b.score - a.score);
}
