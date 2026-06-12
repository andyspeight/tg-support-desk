import "server-only";
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function listInboxMessageIds(sinceDays = 3): Promise<string[]> {
  const params = new URLSearchParams({
    q: `in:inbox newer_than:${sinceDays}d`,
    maxResults: "50",
  });
  const data = (await gmailFetch(`/messages?${params}`)) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

export async function getMessage(id: string): Promise<GmailMessage> {
  return (await gmailFetch(`/messages/${id}?format=full`)) as GmailMessage;
}

function encodeHeaderWord(value: string): string {
  // RFC 2047 encoding for non-ASCII header content.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export function buildReplyMime(input: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
}): string {
  const from = `${encodeHeaderWord(env.supportFromName)} <${env.supportEmail}>`;
  const headers = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references?.length) headers.push(`References: ${input.references.join(" ")}`);

  const body = Buffer.from(input.text, "utf-8").toString("base64");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export async function sendMessage(rawMime: string, threadId?: string | null): Promise<{ id: string; threadId: string }> {
  const raw = Buffer.from(rawMime, "utf-8").toString("base64url");
  const payload: Record<string, string> = { raw };
  if (threadId) payload.threadId = threadId;
  return (await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify(payload),
  })) as { id: string; threadId: string };
}
