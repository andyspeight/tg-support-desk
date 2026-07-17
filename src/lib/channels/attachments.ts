import "server-only";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import type { AttachmentMeta } from "./email-parse";
import {
  ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_BYTES,
  checkAttachment,
  safeFilename,
  storageKeyFor,
  type StoredAttachment,
} from "./attachment-rules";

// Tickets are hostile input — attachments are allowlisted by type, size-capped,
// stored in a private bucket, and only ever served via short-lived signed URLs
// through an auth-gated route. Nothing is rendered inline. (brief §10)

export type { StoredAttachment } from "./attachment-rules";

/**
 * Validate, fetch (via the supplied byte-getter), and store each attachment.
 * Returns the enriched metadata to persist on the message. Best-effort per
 * item: a fetch/upload failure marks that attachment rejected, never throws.
 */
export async function storeAttachments(
  ticketId: string,
  messageId: string,
  metas: AttachmentMeta[],
  fetchBytes: (attachmentId: string) => Promise<Buffer>,
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = [];
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const base: StoredAttachment = {
      filename: meta.filename,
      mimeType: meta.mimeType,
      size: meta.size,
      attachmentId: meta.attachmentId,
      stored: false,
      // Carry the inline-image markers through so the UI can place cid images in
      // the body and keep them out of the attachment strip.
      ...(meta.contentId ? { contentId: meta.contentId } : {}),
      ...(meta.inline ? { inline: true } : {}),
    };

    const check = checkAttachment(meta);
    if (!check.ok) {
      out.push({ ...base, rejected: check.reason });
      continue;
    }
    if (!meta.attachmentId) {
      out.push({ ...base, rejected: "no attachment id" });
      continue;
    }

    try {
      const bytes = await fetchBytes(meta.attachmentId);
      if (bytes.length > MAX_ATTACHMENT_BYTES) {
        out.push({ ...base, rejected: "too large" });
        continue;
      }
      const key = storageKeyFor(env.tenantId, ticketId, messageId, i, meta.filename);
      const { error } = await db()
        .storage.from(ATTACHMENTS_BUCKET)
        .upload(key, bytes, { contentType: meta.mimeType, upsert: true });
      if (error) {
        out.push({ ...base, rejected: `storage error: ${error.message}` });
        continue;
      }
      out.push({ ...base, storageKey: key, stored: true });
    } catch (error) {
      out.push({ ...base, rejected: `fetch error: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return out;
}

/** An agent-uploaded file destined for an outbound reply or internal note.
 *  `contentId` + `inline` mark an image embedded in the body (pasted/dropped),
 *  so the stored record carries its cid and the UI keeps it out of the strip. */
export type OutboundFile = {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
  contentId?: string;
  inline?: boolean;
};

/**
 * Validate and store agent-uploaded files (bytes already in hand). Same
 * allowlist + size cap as inbound; best-effort per item.
 */
export async function storeOutboundAttachments(
  ticketId: string,
  messageId: string,
  files: OutboundFile[],
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const base: StoredAttachment = {
      filename: f.filename,
      mimeType: f.mimeType,
      size: f.size,
      stored: false,
      // Inline (cid) markers so the body render resolves the image and the strip
      // hides it — mirrors how inbound cid images are stored.
      ...(f.contentId ? { contentId: f.contentId } : {}),
      ...(f.inline ? { inline: true } : {}),
    };

    const check = checkAttachment({ mimeType: f.mimeType, size: f.size });
    if (!check.ok) {
      out.push({ ...base, rejected: check.reason });
      continue;
    }
    if (f.content.length > MAX_ATTACHMENT_BYTES) {
      out.push({ ...base, rejected: "too large" });
      continue;
    }
    try {
      const key = storageKeyFor(env.tenantId, ticketId, messageId, i, f.filename);
      const { error } = await db()
        .storage.from(ATTACHMENTS_BUCKET)
        .upload(key, f.content, { contentType: f.mimeType, upsert: true });
      if (error) {
        out.push({ ...base, rejected: `storage error: ${error.message}` });
        continue;
      }
      out.push({ ...base, storageKey: key, stored: true });
    } catch (error) {
      out.push({ ...base, rejected: `store error: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return out;
}

/** Short-lived signed URL for a stored attachment. `download` forces a download
 *  (Content-Disposition: attachment); otherwise it is served inline so the
 *  browser can view it (image/PDF preview). Safe to view inline: the private
 *  bucket is a separate, script-less origin from the app, and the allowlist has
 *  no active types (no SVG/HTML), so nothing executes in the desk's origin. */
export async function signedAttachmentUrl(
  storageKey: string,
  filename: string,
  download = false,
): Promise<string | null> {
  const { data, error } = await db()
    .storage.from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storageKey, 120, download ? { download: safeFilename(filename) } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}
