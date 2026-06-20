import "server-only";
import { env } from "@/lib/env";

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

// Free/ISP mailbox domains that must never be used for domain-level matching.
const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.co.uk",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "aol.com",
  "btinternet.com",
  "sky.com",
  "talktalk.net",
  "virginmedia.com",
  "protonmail.com",
  "proton.me",
]);

async function airtableGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}/${env.airtableClientsBaseId}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.airtablePat}` },
    cache: "no-store",
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

/**
 * Compact, prompt-safe summary of a client record. Allowlist-based and pure —
 * implemented in ./client-summary so it stays unit-testable and so credential
 * fields (ClientCode, API Key) can never reach the AI prompt (brief §10).
 */
export { summariseClientFields as summariseClient } from "./client-summary";
