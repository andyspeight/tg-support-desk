import "server-only";
import { getSyncState, setSyncState } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { resolveTicket } from "@/lib/ai/resolve";
import { ingestGmailMessage } from "./email";
import { getMessage, listInboxMessageIds } from "./gmail";

export type PollSummary = {
  checked: number;
  ingested: number;
  resolved: number;
  errors: string[];
};

/**
 * Gmail polling loop (cron, every minute). Tracks processed message ids in
 * channel_sync_state. A message that errors is marked processed and surfaced
 * in the summary — the email stays in the inbox for manual triage, and a
 * poison message can't block the queue.
 */
export async function pollGmailInbox(): Promise<PollSummary> {
  const state = (await getSyncState("email")) as { processedIds?: string[] };
  const processed = new Set(state.processedIds ?? []);

  const ids = await listInboxMessageIds();
  const fresh = ids.filter((id) => !processed.has(id)).reverse(); // oldest first
  const batch = fresh.slice(0, env.gmailPollBatch);

  const summary: PollSummary = { checked: batch.length, ingested: 0, resolved: 0, errors: [] };

  for (const id of batch) {
    try {
      const gmailMessage = await getMessage(id);
      const result = await ingestGmailMessage(gmailMessage);
      processed.add(id);
      if (!result) continue;
      summary.ingested += 1;

      try {
        await resolveTicket(result.ticket.id, { trigger: "email" });
        summary.resolved += 1;
      } catch (error) {
        // resolveTicket has already fail-safe-escalated the ticket.
        summary.errors.push(`resolve ${result.ticket.id}: ${error instanceof Error ? error.message : error}`);
      }
    } catch (error) {
      processed.add(id);
      summary.errors.push(`ingest ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  await setSyncState("email", { processedIds: [...processed].slice(-500) });
  return summary;
}
