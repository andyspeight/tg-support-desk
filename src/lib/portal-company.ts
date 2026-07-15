import "server-only";
import { matchClientByEmail, companyNameFrom, type ClientRecord } from "@/lib/integrations/airtable-clients";
import { getCompanyMember } from "@/lib/db/queries";

// Which company does a viewer/requester belong to? Resolution order:
//   1. An explicit link set by Travelgenix in Settings (company_members) — a
//      linked company wins outright, and a "no company" row blocks matching
//      entirely (e.g. an ex-employee whose @company.com address would
//      otherwise domain-match).
//   2. Airtable, the source of truth for client identity (brief §4): exact
//      contact-email match, then company domain — with the freemail guard, so
//      a gmail/hotmail address never inherits a whole company by domain.
// Resolved on every portal view, so it's cached briefly per instance to stay
// inside Airtable's rate limits; fails open to null (own-tickets-only) so an
// Airtable wobble never locks a client out.

export type PortalCompany = { id: string; name: string };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: PortalCompany | null }>();

/** Drop a cached resolution — called when Travelgenix links/unlinks an email so
 *  the change shows on the very next portal view. Per-instance best effort;
 *  other warm instances catch up within the TTL. */
export function invalidateCompanyFor(email: string): void {
  cache.delete(email.trim().toLowerCase());
}

export async function companyForEmail(email: string): Promise<PortalCompany | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: PortalCompany | null = null;
  try {
    const explicit = await getCompanyMember(key);
    if (explicit) {
      value = explicit.client_id ? { id: explicit.client_id, name: explicit.client_name ?? "your company" } : null;
    } else {
      let record: ClientRecord | null = null;
      record = await matchClientByEmail(key);
      if (record) value = { id: record.id, name: companyNameFrom(record) };
    }
  } catch {
    return null; // fail open (don't cache the failure)
  }
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 1000) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  }
  return value;
}
