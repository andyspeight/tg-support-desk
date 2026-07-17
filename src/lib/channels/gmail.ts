import "server-only";
import MailComposer from "nodemailer/lib/mail-composer";
import { env } from "@/lib/env";
import type { GmailMessage } from "./email-parse";

/**
 * Thin Gmail REST client (OAuth refresh-token flow on the support@ Workspace
 * mailbox). Required scopes: gmail.readonly + gmail.send.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.gmailClientId,
      client_secret: env.gmailClientSecret,
      refresh_token: env.gmailRefreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function gmailFetch(path: string, init?: RequestInit): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Read both the inbox AND the spam folder: Gmail mis-files real client mail as
// spam, and an unread support email that never becomes a ticket is a lost
// customer. ingestGmailMessage decides what to rescue from spam (known senders /
// existing threads) vs leave alone, so pulling the ids here is safe.
export async function listInboxMessageIds(sinceDays = 3): Promise<string[]> {
  const ids = new Set<string>();
  for (const scope of ["in:inbox", "in:spam"]) {
    const params = new URLSearchParams({
      q: `${scope} newer_than:${sinceDays}d`,
      maxResults: "50",
      includeSpamTrash: "true", // required for in:spam to return anything
    });
    const data = (await gmailFetch(`/messages?${params}`)) as { messages?: { id: string }[] };
    for (const m of data.messages ?? []) ids.add(m.id);
  }
  return [...ids];
}

export async function getMessage(id: string): Promise<GmailMessage> {
  return (await gmailFetch(`/messages/${id}?format=full`)) as GmailMessage;
}

/** Fetch a single attachment's bytes (Gmail returns base64url-encoded data). */
export async function getAttachmentBytes(messageId: string, attachmentId: string): Promise<Buffer> {
  const data = (await gmailFetch(`/messages/${messageId}/attachments/${attachmentId}`)) as { data?: string };
  if (!data.data) throw new Error("attachment has no data");
  return Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// `cid` set → the part is an inline image the HTML body references via
// `src="cid:<cid>"`; nodemailer emits it inline (and clients also list it as an
// attachment). Omitted → an ordinary attachment.
export type OutboundAttachment = { filename: string; mimeType: string; content: Buffer; cid?: string };

/** Build a full reply MIME: text + optional HTML alternative + attachments. */
export async function buildReplyMime(input: {
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
  attachments?: OutboundAttachment[];
  inReplyTo?: string | null;
  references?: string[];
}): Promise<Buffer> {
  const mail = new MailComposer({
    // Display name shows the responding agent when we have one, so the customer
    // sees a person; falls back to the team name (AI replies, unattributed sends).
    from: { name: input.fromName || env.supportFromName, address: env.supportEmail },
    to: input.to,
    cc: input.cc && input.cc.length ? input.cc : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html || undefined,
    inReplyTo: input.inReplyTo || undefined,
    references: input.references && input.references.length ? input.references : undefined,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.mimeType,
      ...(a.cid ? { cid: a.cid } : {}),
    })),
  });
  return mail.compile().build();
}

export async function sendMessage(rawMime: Buffer | string, threadId?: string | null): Promise<{ id: string; threadId: string }> {
  const raw = (Buffer.isBuffer(rawMime) ? rawMime : Buffer.from(rawMime, "utf-8")).toString("base64url");
  const payload: Record<string, string> = { raw };
  if (threadId) payload.threadId = threadId;
  return (await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify(payload),
  })) as { id: string; threadId: string };
}

/** Send a fresh (non-threaded) email from support@ — used for internal agent
 *  alerts (notification mirror + morning digest), not customer-facing. */
export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const mime = await buildReplyMime({ to: input.to, subject: input.subject, text: input.text, html: input.html });
  await sendMessage(mime);
}
