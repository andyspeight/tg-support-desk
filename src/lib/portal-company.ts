import "server-only";
import { matchClientByEmail, companyNameFrom, type ClientRecord } from "@/lib/integrations/airtable-clients";
import {
  getCompanyMember,
  getCompanyDomain,
  isCompanyRestricted,
  upsertCompanyDomainIfAbsent,
  stampTicketsForDomain,
} from "@/lib/db/queries";
import { emailDomain, isCorporateDomain } from "@/lib/channels/email-parse";
import { companyVisibleTo, type VisibleCompany } from "@/lib/portal-visibility";

// Which company does a viewer/requester belong to? Resolution order (first hit
// wins; a later step never overrides an earlier one):
//   1. Exact-email link set by Travelgenix (company_members). A linked company
//      wins outright; a "no company" row blocks matching entirely (e.g. an
//      ex-employee whose @company.com address would otherwise domain-match).
//   2. Corporate-domain link (company_domains) — set when staff link anyone at a
//      corporate domain, so colleagues auto-associate. Never a free-mail domain.
//   3. Airtable, the source of truth for client identity (brief §4): exact
//      contact-email match, then company domain — with the freemail guard.
// Resolved on every portal view, so it's cached briefly per instance to stay
// inside Airtable's rate limits; fails open to null (own-tickets-only) so an
// Airtable wobble never locks a client out.

export type PortalCompany = { id: string; name: string };

/**
 * The company whose tickets this person may READ — not merely the company they
 * belong to. Seeing colleagues' tickets is an explicit grant a human at
 * Travelgenix sets per person (company_members.can_see_all_tickets); everyone
 * else sees only their own, however their company was resolved. That matters
 * because a company can also be inferred from an email domain, which is not
 * consent to read the whole company's support history.
 *
 * Returns null for "own tickets only". Deliberately uncached and read straight
 * from the row, so revoking access takes effect on the very next request rather
 * than whenever a cache expires. Fails closed: any error narrows the view.
 */
export async function visibleCompanyFor(email: string): Promise<VisibleCompany | null> {
  try {
    const company = await companyForEmail(email);
    if (!company) return null;
    // Unrestricted is the default, so the common path costs one indexed read
    // and behaves exactly as it always has.
    const restricted = await isCompanyRestricted(company.id);
    if (!restricted) return company;
    // Restricted: the per-person grant decides. Read straight from the row (not
    // the company cache above) so revoking someone takes effect immediately.
    return companyVisibleTo({ company, restricted, member: await getCompanyMember(email) });
  } catch (error) {
    // Fail closed — a lookup wobble narrows what's visible, never widens it.
    console.error("visibleCompanyFor:", error);
    return null;
  }
}

export type { VisibleCompany } from "@/lib/portal-visibility";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: PortalCompany | null }>();

/** Drop a cached resolution — called when Travelgenix links/unlinks an email so
 *  the change shows on the very next portal view. Per-instance best effort;
 *  other warm instances catch up within the TTL. */
export function invalidateCompanyFor(email: string): void {
  cache.delete(email.trim().toLowerCase());
}

/** Drop cached resolutions for every address at a domain — called when a
 *  domain-level link changes so colleagues pick it up on their next view. */
export function invalidateCompanyForDomain(domain: string): void {
  const suffix = `@${domain.trim().toLowerCase()}`;
  for (const key of cache.keys()) if (key.endsWith(suffix)) cache.delete(key);
}

/**
 * Explicit (Travelgenix-managed) company for an email, WITHOUT the Airtable
 * fallback: an exact company_members row first (a null client_id is an explicit
 * "no company" block that stops here), then a corporate-domain company_domains
 * link. `resolved` is true when an explicit rule applied — so the caller knows
 * not to fall through to Airtable; `value` is the company, or null for a
 * block / no rule.
 */
async function explicitCompany(key: string): Promise<{ resolved: boolean; value: PortalCompany | null }> {
  const member = await getCompanyMember(key);
  if (member) {
    return {
      resolved: true,
      value: member.client_id ? { id: member.client_id, name: member.client_name ?? "your company" } : null,
    };
  }
  const domain = emailDomain(key);
  if (isCorporateDomain(domain)) {
    const dom = await getCompanyDomain(domain);
    if (dom?.client_id) return { resolved: true, value: { id: dom.client_id, name: dom.client_name ?? "your company" } };
  }
  return { resolved: false, value: null };
}

/** Explicit-only resolution (no Airtable) — used on the ticket-ingest hot path
 *  to stamp a linked person/domain's company immediately and cheaply, so a
 *  manual link always carries to future tickets without waiting on the AI loop. */
export async function explicitCompanyForEmail(email: string): Promise<PortalCompany | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  try {
    return (await explicitCompany(key)).value;
  } catch {
    return null; // fail open
  }
}

export async function companyForEmail(email: string): Promise<PortalCompany | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: PortalCompany | null = null;
  try {
    const explicit = await explicitCompany(key);
    if (explicit.resolved) {
      value = explicit.value; // explicit link/block wins — never fall through to Airtable
    } else {
      const record: ClientRecord | null = await matchClientByEmail(key);
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

/**
 * When Travelgenix links a person at a CORPORATE domain to a company, also link
 * the whole domain so colleagues auto-associate — create-if-absent: the first
 * company to claim a domain keeps it; a different later link is reported as a
 * conflict, not a silent takeover. Free-mail domains (and a null clientId) are a
 * no-op — the exact-email link alone stands, exactly as before. On a fresh link
 * it back-stamps the domain's un-stamped tickets and refreshes the cache.
 * Best-effort at the domain layer: never throws (the exact-email link already
 * succeeded before this is called).
 */
export async function linkDomainForCompany(input: {
  email: string;
  clientId: string;
  clientName: string | null;
  createdBy: string;
}): Promise<{ created: boolean; conflictClientId: string | null; stamped: number }> {
  const domain = emailDomain(input.email);
  if (!isCorporateDomain(domain)) return { created: false, conflictClientId: null, stamped: 0 };
  try {
    const { created, existing } = await upsertCompanyDomainIfAbsent({
      domain,
      clientId: input.clientId,
      clientName: input.clientName,
      createdBy: input.createdBy,
    });
    if (!created) {
      const conflictClientId =
        existing && existing.client_id && existing.client_id !== input.clientId ? existing.client_id : null;
      return { created: false, conflictClientId, stamped: 0 };
    }
    const stamped = await stampTicketsForDomain(domain, input.clientId);
    invalidateCompanyForDomain(domain);
    return { created: true, conflictClientId: null, stamped };
  } catch (error) {
    console.error("linkDomainForCompany failed:", error);
    return { created: false, conflictClientId: null, stamped: 0 };
  }
}
