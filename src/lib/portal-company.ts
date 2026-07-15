import "server-only";
import { matchClientByEmail, companyNameFrom, type ClientRecord } from "@/lib/integrations/airtable-clients";

// Which company does a portal viewer belong to? Airtable is the source of truth
// (brief §4): exact contact-email match first, then company domain — with the
// freemail guard, so a gmail/hotmail address never inherits a whole company's
// tickets by domain. Resolved on every portal view, so it's cached briefly
// per instance to stay inside Airtable's rate limits; fails open to null
// (own-tickets-only) so an Airtable wobble never locks a client out.

export type PortalCompany = { id: string; name: string };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: PortalCompany | null }>();

export async function companyForEmail(email: string): Promise<PortalCompany | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let record: ClientRecord | null = null;
  try {
    record = await matchClientByEmail(key);
  } catch {
    return null; // fail open (don't cache the failure)
  }
  const value = record ? { id: record.id, name: companyNameFrom(record) } : null;
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 1000) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  }
  return value;
}
