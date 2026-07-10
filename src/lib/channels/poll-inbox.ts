import "server-only";
import { audit, getSyncState, setSyncState } from "@/lib/db/queries";
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

type SyncState = { processedIds?: string[]; lockUntil?: number };

// Vercel crons fire at most once a minute, but a fresh email shouldn't wait up
// to 60s to be seen. The once-a-minute invocation loops internally on this gap,
// so effective detection latency is ~GAP rather than ~60s. Kept comfortably
// under the minute (BUDGET) so a run finishes before the next tick.
const LOOP_GAP_MS = 10_000;
const LOOP_BUDGET_MS = 40_000;
// A generous lock TTL that only matters if a run dies without releasing (the
// finally clears it normally). Long enough to outlast a slow run, short enough
// to self-heal within a minute or two.
const LOCK_TTL_MS = 90_000;

/**
 * One polling pass. Tracks processed message ids in channel_sync_state and
 * persists each id the moment its message is ingested — BEFORE the ~18s
 * resolution runs — so an overlapping pass can never re-ingest the same message
 * into a duplicate ticket. A message that errors is marked processed and
 * surfaced in the summary; the email stays in the inbox for manual triage so a
 * poison message can't block the queue.
 */
export async function pollGmailInbox(): Promise<PollSummary> {
  const state = (await getSyncState("email")) as SyncState;
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
      await persistProcessed(state, processed); // durable before the slow resolve
      if (!result) continue;
      summary.ingested += 1;

      if (result.suppressAi) {
        // Held for approval, or a machine auto-reply — either way the AI sits out.
        const reason = result.ticket.status === "awaiting_approval" ? "awaiting_approval" : "auto_reply";
        await audit("system", "email-channel", "ai.suppressed", {
          type: "ticket",
          id: result.ticket.id,
        }, { reason });
        continue;
      }

      try {
        await resolveTicket(result.ticket.id, { trigger: "email" });
        summary.resolved += 1;
      } catch (error) {
        // resolveTicket has already fail-safe-escalated the ticket.
        summary.errors.push(`resolve ${result.ticket.id}: ${error instanceof Error ? error.message : error}`);
      }
    } catch (error) {
      processed.add(id);
      await persistProcessed(state, processed);
      summary.errors.push(`ingest ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  return summary;
}

/** Persist processed ids while preserving any other sync-state fields (the lock). */
async function persistProcessed(state: SyncState, processed: Set<string>): Promise<void> {
  await setSyncState("email", { ...state, processedIds: [...processed].slice(-500) });
}

/**
 * Poll repeatedly within a single cron invocation to get near-continuous
 * inbox pickup despite Vercel's 1/min cron floor. A short-lived lock in
 * channel_sync_state stops a slow run from overlapping the next tick (which
 * could double-ingest before ids are persisted); it carries a TTL so a crashed
 * run self-heals rather than wedging the poller.
 */
export async function pollGmailInboxRepeating(): Promise<PollSummary & { passes: number; skipped?: boolean }> {
  const start = Date.now();
  const state = (await getSyncState("email")) as SyncState;
  if (state.lockUntil && state.lockUntil > start) {
    // Another invocation is still looping this window — leave it to it.
    return { checked: 0, ingested: 0, resolved: 0, errors: [], passes: 0, skipped: true };
  }
  await setSyncState("email", { ...state, lockUntil: start + LOCK_TTL_MS });

  const total: PollSummary = { checked: 0, ingested: 0, resolved: 0, errors: [] };
  let passes = 0;
  try {
    for (;;) {
      const pass = await pollGmailInbox();
      total.checked += pass.checked;
      total.ingested += pass.ingested;
      total.resolved += pass.resolved;
      total.errors.push(...pass.errors);
      passes += 1;
      if (Date.now() - start + LOOP_GAP_MS >= LOOP_BUDGET_MS) break;
      await new Promise((resolve) => setTimeout(resolve, LOOP_GAP_MS));
    }
  } finally {
    // Release the lock, preserving whatever processedIds the passes accumulated.
    const latest = (await getSyncState("email")) as SyncState;
    await setSyncState("email", { ...latest, lockUntil: 0 });
  }

  return { ...total, passes };
}
