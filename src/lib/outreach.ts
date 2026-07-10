// Pure helpers for proactive outreach — recipient parsing and greeting
// personalisation. Kept free of server deps so they stay unit-testable.

export type ParsedRecipient = { email: string; name?: string };

// Result shapes shared between the server actions and the review UI. Declared
// here (a plain module) because a "use server" file may only export functions.
export type OutreachDraftResult = { ok: true; draft: string } | { ok: false; error: string };
export type OutreachSendResult = { ok: true; sent: number; failed: number } | { ok: false; error: string };

const EMAIL_RE = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/;

/**
 * Parse a pasted recipient list into unique {email, name} entries. Accepts one
 * recipient per line in any of: "email", "Name <email>", "email, Name",
 * "Name, email". Lines without a valid-looking email are skipped; duplicate
 * emails (case-insensitively) keep only the first.
 */
export function parseRecipients(raw: string): ParsedRecipient[] {
  const out: ParsedRecipient[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(EMAIL_RE);
    if (!match) continue;
    const email = match[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const name = trimmed
      .replace(match[0], "")
      .replace(/[<>]/g, "")
      .replace(/^[\s,;-]+|[\s,;-]+$/g, "")
      .trim();
    out.push(name ? { email, name } : { email });
  }
  return out;
}

/** First name for a greeting, or "there" when we don't have one. */
export function greetingName(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/** Personalise a drafted body: swap the {{name}} token for the recipient's
 *  first name (or "there"). */
export function personaliseOutreach(body: string, name?: string | null): string {
  return body.replaceAll("{{name}}", greetingName(name));
}
