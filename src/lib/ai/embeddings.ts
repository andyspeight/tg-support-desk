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
