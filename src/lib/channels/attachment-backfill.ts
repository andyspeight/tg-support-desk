import "server-only";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getAttachmentBytes } from "./gmail";
import {
  ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_BYTES,
  checkAttachment,
  contentMatches,
  effectiveMimeType,
  storageKeyFor,
  wasInferred,
  type StoredAttachment,
} from "./attachment-rules";

// One-off recovery for attachments that were refused before we resolved generic
// MIME types (Outlook labels screenshots "application/octet-stream"). Those were
// rejected BEFORE we fetched them, so nothing was ever stored — but the original
// is still in the Gmail mailbox and we kept its attachmentId, so we can pull it
// back now and attach it to the ticket where it belongs.
//
// Safe to re-run: anything already stored, or still genuinely not allowed, is
// left exactly as it is.

export type BackfillResult = {
  messagesScanned: number;
  recovered: number;
  stillBlocked: number;
  failed: number;
  errors: string[];
};

type MessageRow = {
  id: string;
  ticket_id: string;
  attachments: unknown;
  channel_meta: unknown;
};

/** Recover attachments we refused only because of a generic declared type. */
export async function backfillRejectedAttachments(limit = 500): Promise<BackfillResult> {
  const result: BackfillResult = { messagesScanned: 0, recovered: 0, stillBlocked: 0, failed: 0, errors: [] };

  const { data, error } = await db()
    .from("messages")
    .select("id,ticket_id,attachments,channel_meta")
    .not("attachments", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`backfill: ${error.message}`);

  for (const row of (data ?? []) as MessageRow[]) {
    const list = (Array.isArray(row.attachments) ? row.attachments : []) as StoredAttachment[];
    // Only messages that actually carry a recoverable rejection.
    const recoverable = list.some((a) => a && !a.stored && a.attachmentId);
    if (recoverable === false) continue;
    result.messagesScanned += 1;

    const gmailMessageId = (row.channel_meta as { gmail_message_id?: string } | null)?.gmail_message_id;
    if (!gmailMessageId) continue;

    const next = [...list];
    let changed = false;

    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (!a || a.stored || !a.attachmentId) continue;

      // Re-apply today's policy. A file that is still not allowed stays blocked.
      const mimeType = effectiveMimeType(a.filename, a.mimeType);
      const check = checkAttachment({ mimeType: a.mimeType, size: a.size, filename: a.filename });
      if (!check.ok) {
        result.stillBlocked += 1;
        continue;
      }

      try {
        const bytes = await getAttachmentBytes(gmailMessageId, a.attachmentId);
        if (bytes.length > MAX_ATTACHMENT_BYTES) {
          result.stillBlocked += 1;
          continue;
        }
        if (wasInferred(a.filename, a.mimeType) && !contentMatches(mimeType, bytes)) {
          result.stillBlocked += 1;
          continue;
        }
        // Index must match the array position — the serving route addresses
        // attachments by index (/api/attachments/<messageId>/<index>).
        const key = storageKeyFor(env.tenantId, row.ticket_id, row.id, i, a.filename);
        const { error: upErr } = await db()
          .storage.from(ATTACHMENTS_BUCKET)
          .upload(key, bytes, { contentType: mimeType, upsert: true });
        if (upErr) throw new Error(upErr.message);

        const restored: StoredAttachment = { ...a, mimeType, storageKey: key, stored: true };
        delete restored.rejected;
        next[i] = restored;
        changed = true;
        result.recovered += 1;
      } catch (err) {
        result.failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        if (result.errors.length < 10) result.errors.push(`${a.filename}: ${msg}`);
      }
    }

    if (changed) {
      const { error: saveErr } = await db()
        .from("messages")
        .update({ attachments: next as unknown as never })
        .eq("id", row.id);
      if (saveErr) {
        result.failed += 1;
        if (result.errors.length < 10) result.errors.push(`save ${row.id}: ${saveErr.message}`);
      }
    }
  }

  return result;
}
