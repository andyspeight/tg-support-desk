// Pure, prompt-safe summarisation of an Airtable client record. No server-only,
// env, or network imports, so it stays unit-testable (mirrors attachment-rules.ts).
//
// SECURITY (brief §10 — no secrets/PII in prompts): get_client_context feeds this
// straight into the AI prompt. The Travelgenix Clients base holds credential-grade
// fields — ClientCode (the client's login password) and API Key. We render an
// ALLOWLIST of safe identity fields only; anything not listed is dropped, so a
// newly-added field is excluded by default rather than leaked. Make this
// tenant-configurable when the desk goes multi-tenant.

export type ClientRecordLike = { id: string; fields: Record<string, unknown> };

export const SAFE_CLIENT_FIELDS = [
  "ClientName",
  "Trading Name",
  "Plan",
  "Status",
  "App Name",
  "Travelify App ID",
  "Travelify Site ID",
  "Website URL",
  "Setup Date",
  "Go-Live Date",
  "Primary Contact Name",
] as const;

// Defence in depth: never render a field whose name looks credential-shaped,
// even if one is mistakenly added to the allowlist above or to a future tenant
// config. The allowlist is the primary gate; this is the backstop.
export const SENSITIVE_FIELD_RE = /code|secret|password|passwd|pwd|token|hash|api[\s_-]?key|key|credential/i;

export function summariseClientFields(record: ClientRecordLike): string {
  const lines: string[] = [`Airtable client record: ${record.id}`];
  for (const field of SAFE_CLIENT_FIELDS) {
    if (SENSITIVE_FIELD_RE.test(field)) continue; // backstop — never leak a secret-shaped field
    const value = record.fields[field];
    if (value === null || value === undefined || value === "") continue;
    let rendered: string;
    if (Array.isArray(value)) {
      const flat = value.filter((v) => typeof v === "string" || typeof v === "number");
      if (!flat.length) continue; // linked-record / attachment objects — skip
      rendered = flat.join(", ");
    } else if (typeof value === "object") {
      continue;
    } else {
      rendered = String(value);
    }
    if (rendered.length > 300) rendered = `${rendered.slice(0, 300)}…`;
    lines.push(`${field}: ${rendered}`);
  }
  return lines.join("\n");
}
