import "server-only";
import { env } from "@/lib/env";
import { FREE_MAIL_DOMAINS } from "@/lib/channels/email-parse";

/**
 * Read-only access to the Airtable Clients base — the source of truth for
 * client identity. The PAT must be scoped read-only to this base.
 *
 * Field names vary per base; AIRTABLE_CLIENT_EMAIL_FIELDS configures which
 * fields are searched for requester-email matching. Align with the
 * airtable-operations skill conventions once ported.
 */

export type ClientRecord = {
  id: string;
  fields: Record<string, unknown>;
};

const API_BASE = "https://api.airtable.com/v0";

// Domain-level matching must never fire on a free/ISP mailbox — shared with the
// allow-list so the two stay in lock-step (one source of truth in email-parse).
const GENERIC_DOMAINS = FREE_MAIL_DOMAINS;

async function airtableGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}/${env.airtableClientsBaseId}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.airtablePat}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Airtable ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getClientById(recordId: string): Promise<ClientRecord | null> {
  try {
    const data = (await airtableGet(`${encodeURIComponent(env.airtableClientsTable)}/${recordId}`, {})) as {
      id: string;
      fields: Record<string, unknown>;
    };
    return { id: data.id, fields: data.fields };
  } catch {
    return null;
  }
}

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function searchByFormula(formula: string): Promise<ClientRecord | null> {
  const data = (await airtableGet(encodeURIComponent(env.airtableClientsTable), {
    filterByFormula: formula,
    maxRecords: "1",
  })) as { records: { id: string; fields: Record<string, unknown> }[] };
  const record = data.records[0];
  return record ? { id: record.id, fields: record.fields } : null;
}

/** Match a requester to a client record: exact email first, then company domain. */
export async function matchClientByEmail(email: string): Promise<ClientRecord | null> {
  const lower = email.toLowerCase();
  const fields = env.airtableClientEmailFields;
  const term = (needle: string) =>
    fields.map((f) => `FIND('${escapeFormulaString(needle)}', LOWER({${f}}&''))`).join(", ");
  const wrap = (terms: string) => (fields.length === 1 ? terms : `OR(${terms})`);

  try {
    const exact = await searchByFormula(wrap(term(lower)));
    if (exact) return exact;

    const domain = lower.split("@")[1];
    if (domain && !GENERIC_DOMAINS.has(domain)) {
      return await searchByFormula(wrap(term(`@${domain}`)));
    }
  } catch (error) {
    console.error("matchClientByEmail failed:", error);
  }
  return null;
}

export type ClientContact = { email: string; name?: string };

// Preference order for a client's display name (real fields on the Clients base,
// per SAFE_CLIENT_FIELDS): a contact person first, then the company/trading name.
const CLIENT_NAME_FIELDS = ["Primary Contact Name", "ClientName", "Trading Name"] as const;

/** Company display name — the business, never a contact person. Used where the
 *  portal shows a shared company view ("Tickets at Acme Travel"). */
export function companyNameFrom(record: ClientRecord): string {
  return firstFieldString(record.fields, ["ClientName", "Trading Name"]) ?? "your company";
}

/** The contact's name — but only when this exact email is recorded as a contact
 *  on the client record. A domain-matched colleague must not inherit the primary
 *  contact's name. */
export function contactNameFromRecord(record: ClientRecord, email: string): string | null {
  const lower = email.trim().toLowerCase();
  const listed = env.airtableClientEmailFields.some((f) => {
    const value = record.fields[f];
    const items = Array.isArray(value) ? value : [value];
    return items.some((v) => typeof v === "string" && v.toLowerCase().includes(lower));
  });
  return listed ? (firstFieldString(record.fields, ["Primary Contact Name"]) ?? null) : null;
}
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstFieldString(fields: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const found = value.find((v) => typeof v === "string" && v.trim());
      if (found) return (found as string).trim();
    }
  }
  return undefined;
}

export type ClientCompany = { id: string; name: string };

/** Every client company (record id + display name), A–Z — the picker list for
 *  linking a user to a company in Settings. Read-only; throws on Airtable error. */
export async function listAllClientCompanies(): Promise<ClientCompany[]> {
  const out: ClientCompany[] = [];
  let offset: string | undefined;
  do {
    const params: Record<string, string> = { pageSize: "100" };
    if (offset) params.offset = offset;
    const data = (await airtableGet(encodeURIComponent(env.airtableClientsTable), params)) as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };
    for (const record of data.records) {
      out.push({ id: record.id, name: companyNameFrom({ id: record.id, fields: record.fields }) });
    }
    offset = data.offset;
  } while (offset && out.length < 5000);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every client with a support email — the recipient pool for a "to all clients"
 * proactive outreach. Paginates the Clients base, skips records without a
 * valid-looking email, and dedupes case-insensitively. Read-only; throws on an
 * Airtable error so the caller can surface it rather than silently under-send.
 */
export async function listAllClients(): Promise<ClientContact[]> {
  const emailFields = env.airtableClientEmailFields;
  const out: ClientContact[] = [];
  const seen = new Set<string>();
  let offset: string | undefined;
  do {
    const params: Record<string, string> = { pageSize: "100" };
    if (offset) params.offset = offset;
    const data = (await airtableGet(encodeURIComponent(env.airtableClientsTable), params)) as {
      records: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };
    for (const record of data.records) {
      const email = firstFieldString(record.fields, emailFields)?.toLowerCase();
      if (!email || !EMAIL_SHAPE.test(email) || seen.has(email)) continue;
      seen.add(email);
      const name = firstFieldString(record.fields, CLIENT_NAME_FIELDS);
      out.push(name ? { email, name } : { email });
    }
    offset = data.offset;
  } while (offset && out.length < 5000);
  return out;
}

/**
 * Compact, prompt-safe summary of a client record. Allowlist-based and pure —
 * implemented in ./client-summary so it stays unit-testable and so credential
 * fields (ClientCode, API Key) can never reach the AI prompt (brief §10).
 */
export { summariseClientFields as summariseClient } from "./client-summary";
