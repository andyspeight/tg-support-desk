import sanitizeHtmlLib from "sanitize-html";
import { isImageMime } from "./attachment-rules";

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
  /** Gmail system/user labels (e.g. "INBOX", "SPAM") — used to rescue mis-filed mail. */
  labelIds?: string[];
  payload?: GmailMessagePart;
};

export type AttachmentMeta = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  /** Bare Content-ID (no <>/scheme) when the part is a cid-referenced image. */
  contentId?: string;
  /** True when this image is embedded in the HTML body (referenced by cid) — it
   *  renders inline there and should not also appear in the attachment strip. */
  inline?: boolean;
};

export type ParsedEmail = {
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  text: string;
  /**
   * The sender's ORIGINAL html body, stored verbatim (see `storableHtml`).
   * Unsafe by definition — it is sanitised at render, never before. Anything
   * that puts this in front of a person must run it through
   * `sanitizeEmailHtml` first.
   */
  html: string | null;
  to: string[];
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

/**
 * Everyone else on a thread who should be copied on replies: the sender, plus
 * the To and Cc recipients — minus ALL of our own addresses (the support
 * address and every send-as/mailbox alias) and the requester (who is always the
 * To of a reply). Lower-cased and de-duped. This keeps a colleague who joins the
 * thread, or anyone the customer copied, on every future reply — while never
 * letting our own mailbox address leak in, which would make us Cc ourselves and
 * re-ingest our own replies.
 */
export function otherParticipants(
  msg: { fromEmail?: string | null; to?: string[]; cc?: string[] },
  opts: { self: string[]; requester: string },
): string[] {
  const exclude = new Set([...opts.self, opts.requester].map((e) => e.trim().toLowerCase()).filter(Boolean));
  const all = [...(msg.fromEmail ? [msg.fromEmail] : []), ...(msg.to ?? []), ...(msg.cc ?? [])].map((e) =>
    e.trim().toLowerCase(),
  );
  return [...new Set(all)].filter((e) => e && !exclude.has(e));
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
    const cidHeader = part.headers ? header(part.headers, "Content-ID") : null;
    out.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
      attachmentId: part.body.attachmentId,
      ...(cidHeader ? { contentId: normaliseCid(cidHeader) } : {}),
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, out);
  return out;
}

/** Normalise a Content-ID header or a `cid:` URL reference to a bare, comparable
 *  token: drop the "cid:" scheme, strip surrounding <>, lowercase. */
export function normaliseCid(raw: string): string {
  return raw.trim().replace(/^cid:/i, "").replace(/^<|>$/g, "").trim().toLowerCase();
}

/** Every distinct cid referenced by the HTML body, normalised. */
function extractCidRefs(html: string): Set<string> {
  const out = new Set<string>();
  const re = /cid:([^"'\s>)]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) out.add(normaliseCid(match[1]));
  return out;
}

/** Render-time context that resolves a message's embedded (cid:) images to their
 *  auth-gated attachment URLs. Omitted at ingest, where cid refs are preserved
 *  as-is for later resolution. */
export type EmailImageCtx = {
  messageId: string;
  attachments: Array<{ contentId?: string; mimeType?: string; stored?: boolean }>;
};

// ---------------------------------------------------------------------------
// What a customer's email is allowed to keep.
//
// Agents must see a ticket as the customer actually sent it — the red "URGENT",
// the highlighted booking reference, the table of failed departures. Flattening
// that to plain text loses meaning, not just decoration: a stripped table reads
// as one unbroken run of words.
//
// So the allowlist is presentational-generous and behaviourally strict. Nothing
// here executes, navigates, loads a remote resource, or hides content from the
// person reading the ticket.
// ---------------------------------------------------------------------------

/** Layout + text tags. No script/style/iframe/object/embed/form/svg/link/meta —
 *  and no <style>, whose CSS would escape the message and restyle the desk. */
const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span", "a", "img",
  "strong", "b", "em", "i", "u", "s", "strike", "del", "ins", "sub", "sup", "small", "big", "tt", "mark", "font", "center",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "abbr", "cite", "q", "figure", "figcaption", "wbr",
];

// Style-value shapes. A declaration survives only if one of its property's
// regexes matches the whole value, so anything unrecognised is dropped.
const COLOUR = /^\s*(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/a-z]+\)|[a-z]{3,24})\s*$/i;
// Word writes lengths as ".5in" and "5.4pt", so both the leading-dot form and
// the full unit set have to be understood or a pasted table loses its spacing.
const NUM = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
const UNIT = String.raw`(?:px|pt|em|rem|ex|ch|%|vw|vh|cm|mm|in|pc)`;
const LENGTH = new RegExp(`^\\s*${NUM}${UNIT}?\\s*$`, "i");
const NUMBER = /^\s*\d+(\.\d+)?\s*$/;
const KEYWORD = /^\s*[a-z][a-z-]{0,24}\s*$/i;
/** Up to four lengths/`auto` — the margin/padding/border-radius shorthand. */
const SPACING = new RegExp(`^\\s*(?:${NUM}${UNIT}?|auto)(?:\\s+(?:${NUM}${UNIT}?|auto)){0,3}\\s*$`, "i");
const FONT_FAMILY = /^[\w\s,'"&.-]{1,200}$/;
/**
 * Free-form values (borders, text-decoration) may hold several tokens and
 * functions like rgb(). They may never hold url()/image-set()/element(), which
 * is how CSS reaches the network — a tracking pixel by another name — nor
 * expression()/attr()/var(), which read the page back.
 */
const SAFE_VALUE = /^(?!.*\b(?:url|expression|image-set|element|attr|var)\s*\()[^;{}<>\\]{1,200}$/i;

const BOX = ["", "-top", "-right", "-bottom", "-left"];
const boxRules = (base: string, patterns: RegExp[]) =>
  Object.fromEntries(BOX.map((side) => [`${base}${side}`, patterns]));

/**
 * Presentational CSS only. Deliberately absent: `display`, `visibility` and
 * `opacity` (a support desk must never let a sender hide text from the agent
 * reading it), `position`/`z-index`/`transform` (which would let a message
 * escape its card and cover the desk), and the `background` shorthand — only
 * `background-color` is allowed, because the shorthand can carry a url().
 */
const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  "*": {
    color: [COLOUR],
    "background-color": [COLOUR],
    // Word writes a highlight as the `background` shorthand. Colour only — the
    // shorthand's other halves are where a url() would hide.
    background: [COLOUR],
    "font-weight": [KEYWORD, /^\s*[1-9]00\s*$/],
    "font-style": [KEYWORD],
    "font-size": [LENGTH, KEYWORD],
    "font-family": [FONT_FAMILY],
    "font-variant": [KEYWORD],
    "text-align": [KEYWORD],
    "text-decoration": [SAFE_VALUE],
    "text-decoration-line": [KEYWORD],
    "text-decoration-color": [COLOUR],
    "text-transform": [KEYWORD],
    "text-indent": [LENGTH],
    "line-height": [LENGTH, NUMBER, KEYWORD],
    "letter-spacing": [LENGTH, KEYWORD],
    "white-space": [KEYWORD],
    "vertical-align": [KEYWORD, LENGTH],
    "list-style-type": [KEYWORD],
    "list-style-position": [KEYWORD],
    float: [/^\s*(left|right|none)\s*$/i],
    clear: [KEYWORD],
    width: [LENGTH, KEYWORD],
    "max-width": [LENGTH, KEYWORD],
    height: [LENGTH, KEYWORD],
    "min-height": [LENGTH],
    ...boxRules("margin", [SPACING]),
    ...boxRules("padding", [SPACING]),
    ...boxRules("border", [SAFE_VALUE]),
    "border-color": [SAFE_VALUE],
    "border-style": [SAFE_VALUE],
    "border-width": [SPACING],
    "border-collapse": [KEYWORD],
    "border-spacing": [SPACING],
    "border-radius": [SPACING],
  },
};

/** Legacy presentational attributes — how most mail clients still express
 *  colour and table layout. Never `class` or `id`: they would collide with the
 *  desk's own stylesheet and anchor targets. */
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  "*": ["style", "align", "valign", "dir", "lang", "title"],
  a: ["href"],
  img: ["src", "alt", "width", "height"],
  font: ["color", "face", "size"],
  table: ["width", "height", "border", "cellpadding", "cellspacing", "bgcolor", "summary"],
  col: ["span", "width"],
  colgroup: ["span", "width"],
  tr: ["bgcolor", "height"],
  td: ["colspan", "rowspan", "width", "height", "bgcolor", "nowrap"],
  th: ["colspan", "rowspan", "width", "height", "bgcolor", "nowrap", "scope"],
  ol: ["start", "type"],
  ul: ["type"],
  li: ["value"],
  hr: ["width", "size", "noshade"],
};

/**
 * Ticket bodies are hostile input. Keep the sender's formatting; drop anything
 * that could act.
 *
 * Sender-embedded images (referenced by `cid:` in the HTML) are handled without
 * ever allowing a remote fetch:
 *  - **Ingest** (no `ctx`): the `cid:` reference is kept verbatim so it can be
 *    resolved once the message + its stored attachments exist.
 *  - **Render** (`ctx` given): each `cid:` is rewritten to this message's
 *    auth-gated `/api/attachments/…` URL. Anything we can't resolve to a stored
 *    image attachment — including every remote/http image (tracking pixels) — is
 *    dropped. Non-cid image sources are never emitted.
 */
export function sanitizeEmailHtml(html: string, ctx?: EmailImageCtx): string {
  const cidToIndex = new Map<string, number>();
  if (ctx) {
    ctx.attachments.forEach((a, i) => {
      if (a.stored && a.contentId && a.mimeType && isImageMime(a.mimeType)) {
        cidToIndex.set(normaliseCid(a.contentId), i);
      }
    });
  }
  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // Images may only carry a cid: source (ingest) or a root-relative URL our own
    // transform produces (render). Remote image schemes are never allowed.
    allowedSchemesByTag: { img: ["cid"] },
    // Drop the CSS/scripts inside these outright rather than spilling their text
    // into the body (sanitize-html's default keeps the text of unknown tags).
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "head", "title"],
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
      img: (_tag, attribs) => {
        const src = (attribs.src ?? "").trim();
        // The sender's own sizing/alignment is part of how the message reads, so
        // carry it across the rewrite; the src is the only thing being replaced.
        const kept: Record<string, string> = {};
        for (const name of ["alt", "width", "height", "style", "align", "title"]) {
          if (attribs[name]) kept[name] = attribs[name];
        }
        const keep = (newSrc: string) => ({ tagName: "img", attribs: { ...kept, src: newSrc } });
        if (/^cid:/i.test(src)) {
          if (!ctx) return keep(src); // ingest: keep the cid ref for later
          const idx = cidToIndex.get(normaliseCid(src));
          if (idx !== undefined) return keep(`/api/attachments/${ctx.messageId}/${idx}`);
        }
        return { tagName: "img", attribs: {} as Record<string, string> }; // remote/unresolved → dropped below
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}

/**
 * A body is kept verbatim up to this size. Beyond it (a mail client that
 * inlined a photo as base64, say) the sanitised form is stored instead — always
 * a complete document, never a body truncated mid-tag.
 */
const MAX_STORED_HTML = 500_000;

/**
 * The html body to persist for a Gmail message: the sender's original markup,
 * NOT a sanitised copy.
 *
 * Sanitising on the way in is lossy and irreversible — it was why every ticket
 * arrived as flat grey text — and it buys nothing, because the only thing that
 * renders a body runs it through `sanitizeEmailHtml` at that moment anyway.
 * Keeping the original means the desk can show more of the customer's message
 * later without needing the mailbox to still hold it.
 *
 * The corollary is a hard rule: **nothing may put this string in front of a
 * person without sanitising it first.**
 */
export function storableHtml(message: GmailMessage): string | null {
  const part = findPart(message.payload, "text/html");
  const raw = part?.body?.data ? decodeBase64Url(part.body.data) : null;
  if (!raw) return null;
  return raw.length <= MAX_STORED_HTML ? raw : sanitizeEmailHtml(raw).slice(0, MAX_STORED_HTML);
}

/**
 * Does this (already sanitised) body bring its own colours? Such a message was
 * written for a white background, so the desk renders it on one — otherwise the
 * sender's black text lands on a dark card in dark mode and disappears. Plain
 * messages keep the desk's own ink and need no special treatment.
 */
export function hasAuthorColour(html: string): boolean {
  return /\b(?:color|background|background-color)\s*[:=]/i.test(html) || /\bbgcolor\s*=/i.test(html);
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
  "yandex.ru",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  "hey.com",
  // Localised free-mail variants (the client base is 80% UK + 5 more countries).
  "yahoo.fr",
  "yahoo.de",
  "yahoo.it",
  "yahoo.es",
  "yahoo.ie",
  "hotmail.fr",
  "hotmail.de",
  "hotmail.es",
  "hotmail.it",
  "outlook.fr",
  "outlook.de",
  "outlook.es",
  "outlook.it",
  "live.fr",
  "live.de",
  "gmx.net",
  "gmx.de",
  "web.de",
  "t-online.de",
  "freenet.de",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "libero.it",
  "virgilio.it",
  "alice.it",
  "tin.it",
  "terra.es",
  "eircom.net",
  // Shared consumer-ISP domains: used by many unrelated firms, so they must NOT
  // group as a single company by domain (only exact address / explicit link).
  "btconnect.com",
  "btopenworld.com",
  "ntlworld.com",
  "blueyonder.co.uk",
  "tiscali.co.uk",
  "tiscali.it",
  "plusnet.com",
  "o2.co.uk",
  "orange.net",
  "supanet.com",
  "care4free.net",
  // US shared consumer-ISP domains (same rationale: many unrelated firms).
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "cox.net",
  "bellsouth.net",
  "charter.net",
  "roadrunner.com",
  "optonline.net",
  "earthlink.net",
]);

/** The lowercased domain part of an email (after the @), or "" if malformed. */
export function emailDomain(email: string): string {
  return email.toLowerCase().trim().split("@")[1] ?? "";
}

/** A real corporate domain — present and NOT a free/ISP/consumer-mail domain.
 *  The single test used to decide whether a whole domain may be grouped as one
 *  company (allow-listing, and domain-level company links). */
export function isCorporateDomain(domain: string): boolean {
  return !!domain && !FREE_MAIL_DOMAINS.has(domain);
}

/**
 * The allow-list pattern to store when a human approves a sender. Corporate
 * addresses are allow-listed by domain ("@acme.com") so the rest of that client
 * is auto-trusted from then on; free-mail addresses are allow-listed exactly
 * (the individual address only). Returns an empty string for an unusable input.
 */
export function allowPatternFor(email: string): string {
  const lower = email.toLowerCase().trim();
  const domain = emailDomain(lower);
  if (!domain) return lower; // malformed — store as-is rather than "@"
  return isCorporateDomain(domain) ? `@${domain}` : lower;
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

  // Flag images the HTML body embeds (cid-referenced) as inline: they render in
  // the body, so the UI hides them from the attachment strip. An image with a
  // Content-ID the body never references stays an ordinary attachment.
  const attachments = collectAttachments(message.payload);
  if (rawHtml) {
    const cidRefs = extractCidRefs(rawHtml);
    for (const a of attachments) {
      if (a.contentId && cidRefs.has(a.contentId)) a.inline = true;
    }
  }

  return {
    fromName: from.name,
    fromEmail: from.email,
    subject,
    messageId: header(headers, "Message-ID") ?? header(headers, "Message-Id"),
    inReplyTo: header(headers, "In-Reply-To"),
    references: referencesRaw.split(/\s+/).filter(Boolean),
    text: stripQuotedReply(text),
    // Stored as sent (see storableHtml) — sanitised at render, not here.
    html: storableHtml(message),
    to: parseAddressList(header(headers, "To")).filter((e) => e !== from.email),
    cc: parseAddressList(header(headers, "Cc")).filter((e) => e !== from.email),
    attachments,
    senderVerified: parseAuthenticationResults(headers),
    isAutoReply: detectAutoReply(headers, subject, fromRaw),
  };
}
