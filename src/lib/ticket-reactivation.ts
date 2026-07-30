import type { TicketStatus } from "@/lib/db/types";

// When a customer writes in again, the ticket's state must reflect that — on
// EVERY channel, and whether or not the AI happens to run afterwards.
//
// This used to be left to the AI resolution loop (which sets 'ai_working' as it
// starts), so the status only appeared to update when the AI engaged. The loop
// deliberately sits out on unverified senders, senders held for approval,
// auto-replies and loop-guard trips — and on those tickets a customer reply left
// the status stuck on "Waiting on customer", which reads as though the ball is
// still with them (#8144).

/**
 * Statuses a genuine customer reply must clear:
 *  - waiting_on_customer — they've now replied, so it is factually over.
 *  - resolved / closed — reopen; the issue evidently isn't finished.
 *
 * Deliberately NOT included: pending, awaiting_supplier and awaiting_custom_dev
 * (a human parked those on ourselves or a third party — a customer chasing
 * doesn't end that wait, and they're already in the open queues), nor
 * escalated / needs_review / ai_working / new (already active), nor
 * awaiting_approval (the spam gate must stay closed until a human vouches).
 */
const REACTIVATE: ReadonlySet<string> = new Set<TicketStatus>([
  "waiting_on_customer",
  "resolved",
  "closed",
]);

/** The patch to apply on a customer reply. Assignable to a tickets update. */
export type CustomerReplyPatch = {
  status?: "new";
  ai_resolved?: boolean;
  resolved_at?: null;
  snoozed_until?: null;
};

/**
 * What to change on a ticket when the customer replies — or null when its state
 * is already correct and nothing should be written.
 *
 * A snooze is always lifted alongside the status: a snoozed ticket is filtered
 * out of the open queues, so without this the reply could still stay hidden.
 */
export function customerReplyPatch(
  ticket: { status: TicketStatus; snoozed_until?: string | null },
): CustomerReplyPatch | null {
  const reactivate = REACTIVATE.has(ticket.status);
  const unsnooze = Boolean(ticket.snoozed_until);
  if (!reactivate && !unsnooze) return null;
  // Snoozed but in a status we leave alone (e.g. awaiting_supplier): just surface
  // it, don't override the state a human chose.
  if (!reactivate) return { snoozed_until: null };

  const wasFinished = ticket.status === "resolved" || ticket.status === "closed";
  return {
    status: "new",
    ...(wasFinished ? { ai_resolved: false, resolved_at: null } : {}),
    ...(unsnooze ? { snoozed_until: null } : {}),
  };
}
