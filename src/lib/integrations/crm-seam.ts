import "server-only";
import { env } from "@/lib/env";
import { mapCompanyToCareSignal, str, num, type CrmCareSignal, type CrmDeal } from "./crm-map";
import type { SupportSummary } from "./crm-support";

/**
 * Read/write seam to the TG B2B CRM (Airtable base, repo tg-b2b-crm). The read
 * side (getCareSignal) powers the Customer 360 care panel: it matches a ticket's
 * requester to a CRM Company — precisely, by whole email (via Contacts) then by
 * exact company name — and returns the care-programme view. Dark until
 * AIRTABLE_CRM_BASE_ID is set. The write side stays a stub until Phase 4.
 */

export type { CrmCareSignal, CrmDeal } from "./crm-map";
export type { SupportSummary } from "./crm-support";

const API_BASE = "https://api.airtable.com/v0";

/** A one-off support event logged to a Company's activity timeline. */
export type SupportActivity = { summary: string; detail?: string };

const escapeFormula = (s: string): string => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function crmGet(path: string, params: Record<string, string>): Promise<{ records?: { id: string; fields: Record<string, unknown> }[]; id?: string; fields?: Record<string, unknown> }> {
  const url = new URL(`${API_BASE}/${env.airtableCrmBaseId}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.airtableCrmPat}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CRM ${path}: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

/** Writes use the WRITE-scoped token; reads (crmGet) stay on the read token. */
async function crmWrite(path: string, method: "POST" | "PATCH", body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}/${env.airtableCrmBaseId}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.airtableCrmWritePat}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CRM ${method} ${path}: ${res.status} ${await res.text().catch(() => "")}`);
}

/** Precisely tie a requester to a CRM Company: whole-email match via Contacts
 *  first (per-person, exact), then exact company-name equality. No substring or
 *  domain matching — showing another company's care data would be a leak. */
async function findCompany(
  companyName: string | null,
  email: string | null,
): Promise<{ id: string; fields: Record<string, unknown>; matchedBy: "email" | "name" } | null> {
  if (email) {
    const e = email.trim().toLowerCase();
    const data = await crmGet("Contacts", { filterByFormula: `LOWER({Email})='${escapeFormula(e)}'`, maxRecords: "1" });
    const link = data.records?.[0]?.fields?.["Company"];
    const companyId = Array.isArray(link) && typeof link[0] === "string" ? link[0] : null;
    if (companyId) {
      const company = await crmGet(`Companies/${encodeURIComponent(companyId)}`, {});
      if (company.id && company.fields) return { id: company.id, fields: company.fields, matchedBy: "email" };
    }
  }
  if (companyName?.trim()) {
    const n = companyName.trim().toLowerCase();
    const data = await crmGet("Companies", { filterByFormula: `LOWER({Name})='${escapeFormula(n)}'`, maxRecords: "1" });
    const company = data.records?.[0];
    if (company) return { id: company.id, fields: company.fields, matchedBy: "name" };
  }
  return null;
}

async function fetchOpenDeals(name: string): Promise<CrmDeal[]> {
  const data = await crmGet("Deals", {
    filterByFormula: `AND(LOWER(ARRAYJOIN({Company}))='${escapeFormula(name.toLowerCase())}', {Stage}!='Won', {Stage}!='Lost')`,
    maxRecords: "10",
  });
  return (data.records ?? []).map((r) => ({
    name: str(r.fields["Deal Name"]),
    stage: str(r.fields["Stage"]),
    mrr: num(r.fields["MRR"]),
    expectedClose: str(r.fields["Expected Close Date"]) || null,
  }));
}

async function fetchNextCareTouch(name: string): Promise<CrmCareSignal["nextCareTouch"]> {
  const data = await crmGet("Care Touches", {
    filterByFormula: `AND(LOWER(ARRAYJOIN({Company}))='${escapeFormula(name.toLowerCase())}', {Status}='Scheduled')`,
    "sort[0][field]": "Due Date",
    "sort[0][direction]": "asc",
    maxRecords: "1",
  });
  const t = data.records?.[0];
  return t ? { type: str(t.fields["Touch Type"]) || null, dueDate: str(t.fields["Due Date"]) || null } : null;
}

/** Customer 360 care panel: the client's care-programme view from the CRM.
 *  Returns null when the CRM isn't configured or no company matches. */
export async function getCareSignal(match: { companyName?: string | null; email?: string | null }): Promise<CrmCareSignal | null> {
  if (!env.crmConfigured) return null;
  try {
    const company = await findCompany(match.companyName ?? null, match.email ?? null);
    if (!company) return null;
    const name = str(company.fields["Name"]);
    const [openDeals, nextCareTouch] = await Promise.all([
      fetchOpenDeals(name).catch(() => [] as CrmDeal[]),
      fetchNextCareTouch(name).catch(() => null),
    ]);
    return mapCompanyToCareSignal(company.fields, { openDeals, nextCareTouch, matchedBy: company.matchedBy });
  } catch (error) {
    console.error("getCareSignal failed:", error);
    return null;
  }
}

/** Resolve a requester to the CRM Company record id (for writes). Precise match
 *  only — email→Contact→Company, then exact company name. Null if unmatched. */
export async function resolveCrmCompanyId(match: { companyName?: string | null; email?: string | null }): Promise<string | null> {
  if (!env.crmConfigured) return null;
  try {
    const company = await findCompany(match.companyName ?? null, match.email ?? null);
    return company?.id ?? null;
  } catch (error) {
    console.error("resolveCrmCompanyId failed:", error);
    return null;
  }
}

/** Write the rolling support summary onto a CRM Company record (the write-back
 *  360). Requires the write token. Throws on failure so the caller can log it. */
export async function updateCompanySupportSummary(companyId: string, summary: SupportSummary): Promise<void> {
  await crmWrite(`Companies/${encodeURIComponent(companyId)}`, "PATCH", {
    fields: {
      "Support Open Tickets": summary.openTickets,
      "Support Tickets 30d": summary.tickets30d,
      "Support Last Issue": summary.lastIssue ?? "",
      "Support Last Contact": summary.lastContact,
      "Support Sentiment": summary.sentiment,
      "Support Updated": new Date().toISOString(),
    },
    typecast: true,
  });
}

/** Log a support event to a Company's activity timeline. typecast lets the
 *  "Support" type + "Support Desk" source auto-create on first write. */
export async function logSupportActivity(companyId: string, activity: SupportActivity): Promise<void> {
  await crmWrite("Activities", "POST", {
    records: [
      {
        fields: {
          Summary: activity.summary.slice(0, 250),
          Type: "Support",
          Source: "Support Desk",
          Date: new Date().toISOString(),
          "Raw Content": activity.detail ?? "",
          Company: [companyId],
        },
      },
    ],
    typecast: true,
  });
}
