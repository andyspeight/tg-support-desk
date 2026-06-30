import sanitizeHtmlLib from "sanitize-html";

// Pure email-parsing helpers (no env / no network) so they stay unit-testable.

export type GmailHeader = { name: string; value: string };

export type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

export type AttachmentMeta = { filename: string; mimeType: string; size: number; attachmentId?: string };

export type ParsedEmail = {
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  text: string;
  html: string | null;
  cc: string[];
  attachments: AttachmentMeta[];
  /** Result of the receiving server's SPF/DKIM/DMARC checks. */
  senderVerified: "pass" | "fail" | "unknown";
  /** OOO/auto-responder/bounce — the AI must never reply to these (loop guard). */
  isAutoReply: boolean;
};

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/** Parse a comma-separated address-list header (To/Cc) into unique emails. */
export function parseAddressList(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const { email } = parseAddress(part);
    if (email) seen.add(email);
  }
  return [...seen];
}

export function parseAddress(raw: string): { name: string | null; email: string | null } {
  const angled = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1].trim();
    return { name: name || null, email: angled[2].trim().toLowerCase() };
  }
  const bare = raw.match(/[^\s@<>,;]+@[^\s@<>,;]+/);
  return { name: null, email: bare ? bare[0].toLowerCase() : null };
}

function header(headers: GmailHeader[], name: string): string | null {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

function findPart(part: GmailMessagePart | undefined, mimeType: string): GmailMessagePart | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function collectAttachments(part: GmailMessagePart | undefined, out: AttachmentMeta[] = []): AttachmentMeta[] {
  if (!part) return out;
  if (part.filename && part.body?.attachmentId) {
    out.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
      attachmentId: part.body.attachmentId,
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, out);
  return out;
}

/** Ticket bodies are hostile input — strip everything but basic formatting. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: ["p", "br", "a", "strong", "b", "em", "i", "u", "ul", "ol", "li", "blockquote", "pre", "code", "div", "span"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}

export function htmlToText(html: string): string {
  const stripped = sanitizeHtmlLib(html, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const QUOTE_MARKERS = [
  /^On .{5,200} wrote:\s*$/,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^_{6,}\s*$/,
  /^From:\s.+$/,
  /^Le .{5,200} a écrit\s?:\s*$/,
  /^Am .{5,200} schrieb .+:\s*$/,
];

/**
 * Remove quoted history and trailing signatures before the body reaches the
 * AI. Conservative: if stripping would leave nothing, the original is kept.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let cut = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (QUOTE_MARKERS.some((re) => re.test(line))) {
      cut = i;
      break;
    }
    // A run of quoted lines that continues to the end is history, not content.
    if (/^>/.test(line)) {
      const rest = lines.slice(i);
      const quoted = rest.filter((l) => /^\s*>/.test(l) || l.trim() === "").length;
      if (quoted === rest.length) {
        cut = i;
        break;
      }
    }
  }

  let kept = lines.slice(0, cut);

  // Trailing "-- " signature delimiter.
  const sigIndex = kept.findIndex((l) => /^--\s*$/.test(l));
  if (sigIndex > 0) kept = kept.slice(0, sigIndex);

  const result = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result.length > 0 ? result : text.trim();
}

/**
 * Match an email against blocklist patterns. A pattern is either an exact
 * address (case-insensitive) or a domain rule beginning with "@" that matches
 * any address at (or under a subdomain of) that domain.
 */
export function matchesBlocklist(email: string, patterns: string[]): boolean {
  const lower = email.toLowerCase().trim();
  const domain = lower.split("@")[1] ?? "";
  for (const raw of patterns) {
    const pattern = raw.toLowerCase().trim();
    if (!pattern) continue;
    if (pattern.startsWith("@")) {
      const d = pattern.slice(1);
      if (domain === d || domain.endsWith(`.${d}`)) return true;
    } else if (pattern === lower) {
      return true;
    }
  }
  return false;
}

// Free/ISP mailbox domains that must never be allow-listed (or matched) at the
// domain level — allow-listing "@gmail.com" would wave through the whole world.
// Senders on these domains are only ever allow-listed by their exact address.
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.co.uk",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "btinternet.com",
  "sky.com",
  "talktalk.net",
  "virginmedia.com",
  "f2s.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "gmx.com",
  "gmx.co.uk",
  "mail.com",
  "yandex.com",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  "hey.com",
]);

/**
 * The allow-list pattern to store when a human approves a sender. Corporate
 * addresses are allow-listed by domain ("@acme.com") so the rest of that client
 * is auto-trusted from then on; free-mail addresses are allow-listed exactly
 * (the individual address only). Returns an empty string for an unusable input.
 */
export function allowPatternFor(email: string): string {
  const lower = email.toLowerCase().trim();
  const domain = lower.split("@")[1] ?? "";
  if (!domain) return lower; // malformed — store as-is rather than "@"
  return FREE_MAIL_DOMAINS.has(domain) ? lower : `@${domain}`;
}

export function normaliseSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

const AUTO_REPLY_SUBJECTS = [
  /^(automatic reply|auto.?reply|autosvar|automatische antwort|r[ée]ponse automatique)/i,
  /^out of office/i,
  /^(undeliverable|undelivered mail|delivery status notification|mail delivery (failed|subsystem))/i,
];

const AUTO_SENDER = /(^|<)(mailer-daemon|postmaster|no-?reply|do-?not-?reply|noreply)[@.]/i;

export function detectAutoReply(headers: GmailHeader[], subject: string, fromRaw: string): boolean {
  const autoSubmitted = header(headers, "Auto-Submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase().trim() !== "no") return true;
  if (header(headers, "X-Autoreply") || header(headers, "X-Autorespond") || header(headers, "X-Auto-Response-Suppress")) {
    return true;
  }
  if (header(headers, "X-Failed-Recipients")) return true;
  const precedence = header(headers, "Precedence");
  if (precedence && /^(bulk|junk|auto_reply|list)$/i.test(precedence.trim())) return true;
  if (AUTO_SENDER.test(fromRaw)) return true;
  return AUTO_REPLY_SUBJECTS.some((re) => re.test(subject.trim()));
}

function parseAuthenticationResults(headers: GmailHeader[]): "pass" | "fail" | "unknown" {
  const value = header(headers, "Authentication-Results");
  if (!value) return "unknown";
  const spfPass = /spf=pass/i.test(value);
  const dkimPass = /dkim=pass/i.test(value);
  const dmarcFail = /dmarc=fail/i.test(value);
  if (dmarcFail || (!spfPass && !dkimPass)) return "fail";
  return spfPass || dkimPass ? "pass" : "unknown";
}

export function parseGmailMessage(message: GmailMessage): ParsedEmail {
  const headers = message.payload?.headers ?? [];
  const fromRaw = header(headers, "From") ?? "";
  const from = parseAddress(fromRaw);
  const subject = header(headers, "Subject")?.trim() || "(no subject)";

  const textPart = findPart(message.payload, "text/plain");
  const htmlPart = findPart(message.payload, "text/html");
  const rawHtml = htmlPart?.body?.data ? decodeBase64Url(htmlPart.body.data) : null;

  let text = textPart?.body?.data ? decodeBase64Url(textPart.body.data) : "";
  if (!text && rawHtml) text = htmlToText(rawHtml);

  const referencesRaw = header(headers, "References") ?? "";

  return {
    fromName: from.name,
    fromEmail: from.email,
    subject,
    messageId: header(headers, "Message-ID") ?? header(headers, "Message-Id"),
    inReplyTo: header(headers, "In-Reply-To"),
    references: referencesRaw.split(/\s+/).filter(Boolean),
    text: stripQuotedReply(text),
    html: rawHtml ? sanitizeEmailHtml(rawHtml) : null,
    cc: parseAddressList(header(headers, "Cc")).filter((e) => e !== from.email),
    attachments: collectAttachments(message.payload),
    senderVerified: parseAuthenticationResults(headers),
    isAutoReply: detectAutoReply(headers, subject, fromRaw),
  };
}
