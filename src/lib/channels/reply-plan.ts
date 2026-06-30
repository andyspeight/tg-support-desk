// Pure policy for how a ticket reply leaves the desk. Kept dependency-free (no
// server-only / DB / env imports) so it is unit-testable and can't drag the
// throwing Gmail env getters into a code path that shouldn't send.

export type ReplyDelivery = "delivered" | "stored";

/**
 * Decide how a reply is delivered. The client should always hear back by email,
 * whatever channel they came in on (a portal/web-form submitter gives an email
 * and expects a reply there — they don't live in the portal). The in-app copy is
 * a bonus: the message row is stored regardless, so the portal still shows it.
 *  - "email":  Gmail is wired → email the customer (and store the message row).
 *  - "inapp":  non-email channel with Gmail NOT configured → store + show in-app.
 *  - "store":  email-channel ticket with Gmail NOT configured → persist only,
 *              send nothing (a missing mailbox must never crash the reply flow).
 */
export function replyOutbound(channel: string, gmailConfigured: boolean): "email" | "inapp" | "store" {
  if (gmailConfigured) return "email";
  return channel === "email" ? "store" : "inapp";
}
