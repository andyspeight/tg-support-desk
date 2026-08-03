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

// Mail clients routinely mislabel perfectly ordinary attachments. Outlook sends
// pasted/inline screenshots as "application/octet-stream" (the image001.png /
// image002.jpg family), so a declared-type-only allowlist blocked real client
// screenshots. We fall back to the file extension for these generic labels —
// the allowlist below still decides, so nothing new becomes acceptable.
const GENERIC_MIME = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
  "application/unknown",
  "application/force-download",
  "application/download",
]);

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * The type we treat an attachment as. A specific declared type is honoured as
 * before; only a generic/missing one falls back to the filename extension. An
 * unrecognised extension keeps the original label, so it still fails the
 * allowlist — this widens nothing, it just stops trusting a lazy declaration.
 */
export function effectiveMimeType(filename: string, declaredMime: string): string {
  const declared = (declaredMime || "").trim().toLowerCase();
  if (declared && !GENERIC_MIME.has(declared)) return declared;
  const ext = (filename || "").trim().toLowerCase().split(".").pop() ?? "";
  return EXT_MIME[ext] ?? declared;
}

/** True when the declared type told us nothing and we inferred from the name. */
export function wasInferred(filename: string, declaredMime: string): boolean {
  const declared = (declaredMime || "").trim().toLowerCase();
  return (!declared || GENERIC_MIME.has(declared)) && effectiveMimeType(filename, declaredMime) !== declared;
}

/**
 * Detect a file's real type from its leading bytes, for the formats where that
 * is reliable. Returns null when it isn't one of them (which is not by itself a
 * failure — plain text and Office documents have no usable signature).
 */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  const at = (i: number) => (i < b.length ? b[i] : -1);
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return "image/gif";
  if (
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) {
    return "image/webp";
  }
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return "application/pdf";
  return null;
}

/**
 * Guard for the inferred case only: when we've trusted a filename extension, the
 * bytes must actually match if the format is one we can verify. Stops a renamed
 * executable riding in as "screenshot.png". Types with no signature (text,
 * Office) pass — they're inert downloads, exactly as before this change.
 */
export function contentMatches(mimeType: string, bytes: Uint8Array): boolean {
  const sniffed = sniffMime(bytes);
  if (!sniffed) return !isImageMime(mimeType) && mimeType !== "application/pdf";
  return sniffed === mimeType;
}

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

/** Allowlist + cap check. Tickets are hostile input — deny by default. The
 *  filename is optional and used only to resolve a generic declared type. */
export function checkAttachment(
  meta: { mimeType: string; size: number; filename?: string },
): { ok: true } | { ok: false; reason: string } {
  const mime = effectiveMimeType(meta.filename ?? "", meta.mimeType);
  if (!ALLOWED_MIME.has(mime)) {
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
