// Pure policy for how a ticket reply leaves the desk. Kept dependency-free (no
// server-only / DB / env imports) so it is unit-testable and can't drag the
// throwing Gmail env getters into a code path that shouldn't send.

export type ReplyDelivery = "delivered" | "stored";

/**
 * Decide how a reply is delivered:
 *  - "email":  an email-channel ticket on a wired mailbox → send for real.
 *  - "store":  an email-channel ticket with Gmail NOT configured → persist the
 *              reply on the ticket but send nothing. Pre-go-live demos and a
 *              missing mailbox must never crash the reply flow.
 *  - "inapp":  any non-email channel (portal, widget) → delivered in-app.
 */
export function replyOutbound(channel: string, gmailConfigured: boolean): "email" | "inapp" | "store" {
  if (channel !== "email") return "inapp";
  return gmailConfigured ? "email" : "store";
}
