import "server-only";
import { embed } from "./embeddings";
import { getTicketWithMessages, listTicketsNeedingEmbedding, upsertTicketEmbedding } from "@/lib/db/queries";
import { embeddableTicketText } from "@/lib/ticket-embedding-text";

// Small batches respect the Voyage free-tier token budget (same as kb-publish);
// the cron drains the backlog over successive runs and keeps up with new resolves.
const BATCH = 8;

/**
 * Embed a batch of resolved/closed tickets that don't yet have a vector, so they
 * become findable by meaning in the search box. Idempotent and resumable — the
 * work list only returns un-embedded tickets.
 */
export async function embedResolvedTickets(): Promise<{ embedded: number; remaining: number }> {
  const candidates = await listTicketsNeedingEmbedding(BATCH);
  if (candidates.length === 0) return { embedded: 0, remaining: 0 };

  const docs: { id: string; text: string }[] = [];
  for (const candidate of candidates) {
    const loaded = await getTicketWithMessages(candidate.id);
    if (!loaded) continue;
    const text = embeddableTicketText(loaded.ticket.subject, loaded.messages);
    docs.push({ id: candidate.id, text: text || candidate.subject });
  }
  if (docs.length === 0) return { embedded: 0, remaining: 0 };

  const vectors = await embed(
    docs.map((d) => d.text),
    "document",
  );
  let embedded = 0;
  for (let i = 0; i < docs.length; i++) {
    await upsertTicketEmbedding(docs[i].id, vectors[i]);
    embedded += 1;
  }
  // If we filled the batch there may be more; report so the run is observable.
  return { embedded, remaining: candidates.length === BATCH ? BATCH : 0 };
}
