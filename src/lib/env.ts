import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function csv(name: string, fallback = ""): string[] {
  return optional(name, fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Lazy getters: missing vars fail at first use, not at build time.
export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get resolutionModel() {
    return optional("RESOLUTION_MODEL", "claude-fable-5");
  },
  get utilityModel() {
    return optional("UTILITY_MODEL", "claude-haiku-4-5");
  },
  get voyageApiKey() {
    return required("VOYAGE_API_KEY");
  },
  get embeddingModel() {
    return optional("EMBEDDING_MODEL", "voyage-3.5");
  },
  get airtablePat() {
    return required("AIRTABLE_PAT");
  },
  get airtableClientsBaseId() {
    return required("AIRTABLE_CLIENTS_BASE_ID");
  },
  get airtableClientsTable() {
    return optional("AIRTABLE_CLIENTS_TABLE", "Clients");
  },
  get airtableClientEmailFields() {
    return csv("AIRTABLE_CLIENT_EMAIL_FIELDS", "Email");
  },
  get gmailClientId() {
    return required("GMAIL_CLIENT_ID");
  },
  get gmailClientSecret() {
    return required("GMAIL_CLIENT_SECRET");
  },
  get gmailRefreshToken() {
    return required("GMAIL_REFRESH_TOKEN");
  },
  get supportEmail() {
    return required("SUPPORT_EMAIL").toLowerCase();
  },
  get supportFromName() {
    return optional("SUPPORT_FROM_NAME", "Travelgenix Support");
  },
  get tgAuthSessionUrl() {
    return optional("TG_AUTH_SESSION_URL");
  },
  get agentEmails() {
    return csv("AGENT_EMAILS").map((e) => e.toLowerCase());
  },
  get authDevBypass() {
    // Local dev convenience (next dev). Plus a deliberately narrow preview escape
    // hatch: PREVIEW_NO_SSO lets the team click through a PRIVATE Vercel *preview*
    // deployment before the .travelify.io SSO is wired. Hard-blocked on production
    // via VERCEL_ENV so it can never open the real desk. Remove once SSO is live.
    const localDev = optional("AUTH_DEV_BYPASS") === "true" && process.env.NODE_ENV !== "production";
    const previewOnly = optional("PREVIEW_NO_SSO") === "true" && process.env.VERCEL_ENV !== "production";
    return localDev || previewOnly;
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  // Public base URL for links emailed to customers (e.g. CSAT surveys).
  get appBaseUrl() {
    return optional("APP_BASE_URL");
  },
  // Signing key for CSAT survey links; falls back to CRON_SECRET. Empty when
  // neither is set (survey links are simply not generated).
  get csatSecret() {
    return optional("CSAT_SECRET") || optional("CRON_SECRET");
  },
  get tenantId() {
    return optional("DEFAULT_TENANT_ID", "travelgenix");
  },
  get aiConfidenceThreshold() {
    return Number(optional("AI_CONFIDENCE_THRESHOLD", "0.55"));
  },
  get aiMaxTurns() {
    return Number(optional("AI_MAX_TURNS", "8"));
  },
  get gmailPollBatch() {
    return Number(optional("GMAIL_POLL_BATCH", "10"));
  },
};
