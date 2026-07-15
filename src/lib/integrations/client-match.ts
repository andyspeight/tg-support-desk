// Pure matching logic for resolving a requester email to a client record.
// Kept server-free (no env / no fetch) so it's unit-testable — the security of
// the whole company-visibility feature rests on this being EXACT, not fuzzy.
//
// The Airtable query uses FIND() (substring containment) only as a COARSE
// prefilter to limit rows fetched; the trust decision is made here, precisely:
//  - exact match  → the address appears as a WHOLE address on the record
//    (so "bob@x.co" never matches a record holding "bob@x.co.uk"), and
//  - domain match → the record has an address at EXACTLY this domain
//    (so "@acme.co" never matches "acme.co.uk").

export type ClientRecordLike = { id: string; fields: Record<string, unknown> };

// Whole email addresses, lowercased, pulled out of a field value that may be a
// bare address, a "Name <addr>" string, or a comma/space-separated list.
const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g;

/** Every email address recorded on the configured email fields of a record. */
export function recordEmails(fields: Record<string, unknown>, emailFields: string[]): string[] {
  const out: string[] = [];
  for (const f of emailFields) {
    const value = fields[f];
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (typeof item !== "string") continue;
      const found = item.toLowerCase().match(EMAIL_RE);
      if (found) out.push(...found);
    }
  }
  return out;
}

/** The first candidate that lists this exact address as a contact, or null. */
export function pickExactEmailMatch(
  candidates: ClientRecordLike[],
  email: string,
  emailFields: string[],
): ClientRecordLike | null {
  const lower = email.trim().toLowerCase();
  return candidates.find((c) => recordEmails(c.fields, emailFields).includes(lower)) ?? null;
}

/** The first candidate that has a contact address at EXACTLY this domain, or null. */
export function pickDomainMatch(
  candidates: ClientRecordLike[],
  domain: string,
  emailFields: string[],
): ClientRecordLike | null {
  const d = domain.trim().toLowerCase();
  if (!d) return null;
  return candidates.find((c) => recordEmails(c.fields, emailFields).some((e) => e.split("@")[1] === d)) ?? null;
}
