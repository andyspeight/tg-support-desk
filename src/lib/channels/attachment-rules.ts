// Pure attachment policy — no server-only / env / db imports, so it stays
// unit-testable. The storage side (fetch/upload/sign) lives in attachments.ts.

export const ATTACHMENTS_BUCKET = "attachments";
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export type StoredAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  storageKey?: string;
  stored: boolean;
  rejected?: string;
  /** Bare Content-ID for a cid-referenced inline image (resolves body <img> src). */
  contentId?: string;
  /** True when embedded in the HTML body — rendered inline, hidden from the strip. */
  inline?: boolean;
};

/** Raster image types that are safe to render inline as <img> (the allowlist has
 *  no SVG/HTML, so nothing active). Everything else opens/downloads via a link. */
export function isImageMime(mime: string): boolean {
  return /^image\/(png|jpe?g|gif|webp)$/i.test((mime || "").trim());
}

/** Allowlist + cap check. Tickets are hostile input — deny by default. */
export function checkAttachment(meta: { mimeType: string; size: number }): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_MIME.has(meta.mimeType.toLowerCase())) {
    return { ok: false, reason: `type not allowed (${meta.mimeType || "unknown"})` };
  }
  if (meta.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: `too large (${Math.round(meta.size / 1048576)}MB > 25MB)` };
  }
  return { ok: true };
}

/** Strip any path components and unsafe characters from a filename. */
export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "file";
}

export function storageKeyFor(
  tenantId: string,
  ticketId: string,
  messageId: string,
  index: number,
  filename: string,
): string {
  return `${tenantId}/${ticketId}/${messageId}/${index}-${safeFilename(filename)}`;
}
