import "server-only";
import { db } from "@/lib/db/client";
import { getMessage } from "./gmail";
import { storableHtml } from "./email-parse";

// One-off recovery for message bodies that were flattened on the way in.
//
// The desk used to sanitise a customer's email at ingest and store only the
// result, which threw away their colours, tables and emphasis before anyone saw
// the ticket. New mail is now stored as sent (and sanitised at render instead),
// but everything received before that is already flat in the database — and the
// original is still sitting in the support mailbox.
//
// So: re-fetch each message from Gmail and put the sender's body back.
//
// Safe to re-run. A body is only ever replaced by the original of the very same
// Gmail message, and only when we successfully fetched one; anything we can't
// fetch is left exactly as it is.

export type BodyBackfillResult = {
  messagesScanned: number;
  restored: number;
  unchanged: number;
  failed: number;
  errors: string[];
};

type MessageRow = {
  id: string;
  body_html: string | null;
  channel_meta: unknown;
};

/** Restore customer message bodies to the html their sender actually sent. */
export async function backfillMessageBodies(limit = 750): Promise<BodyBackfillResult> {
  const result: BodyBackfillResult = { messagesScanned: 0, restored: 0, unchanged: 0, failed: 0, errors: [] };

  // Inbound mail only: our own replies were composed in the desk and stored
  // whole, so there is nothing to recover for them.
  const { data, error } = await db()
    .from("messages")
    .select("id,body_html,channel_meta")
    .eq("role", "customer")
    .not("body_html", "is", null)
    .not("channel_meta->>gmail_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`body backfill: ${error.message}`);

  for (const row of (data ?? []) as MessageRow[]) {
    const gmailMessageId = (row.channel_meta as { gmail_message_id?: string } | null)?.gmail_message_id;
    if (!gmailMessageId) continue;
    result.messagesScanned += 1;

    try {
      const original = storableHtml(await getMessage(gmailMessageId));
      // No html part (a plain-text sender), or we already hold the original.
      if (!original || original === row.body_html) {
        result.unchanged += 1;
        continue;
      }
      const { error: saveErr } = await db().from("messages").update({ body_html: original }).eq("id", row.id);
      if (saveErr) throw new Error(saveErr.message);
      result.restored += 1;
    } catch (err) {
      result.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      if (result.errors.length < 10) result.errors.push(`${row.id}: ${msg}`);
    }
  }

  return result;
}
