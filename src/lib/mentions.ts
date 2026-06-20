// Parse @mentions in an internal note against the agent roster. Matches a bare
// local-part (@alice → alice@…), an @-prefixed full email (@alice@travelgenix.io),
// or a bare full email (alice@travelgenix.io). Pure + dependency-free so it can
// be unit-tested in isolation and reused server-side.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseMentions(text: string, agentEmails: string[]): string[] {
  if (!text || !text.includes("@")) return [];
  const lower = text.toLowerCase();
  const hits = new Set<string>();

  for (const raw of agentEmails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    const local = email.split("@")[0];
    // @local with sane boundaries (so @alice doesn't match @alicia).
    const atLocal = new RegExp(`(^|[^\\w.@-])@${escapeRegExp(local)}(?![\\w.-])`).test(lower);
    if (atLocal || lower.includes(email)) hits.add(email);
  }

  return [...hits];
}
