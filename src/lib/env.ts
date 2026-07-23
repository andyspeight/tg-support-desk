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
  // Non-throwing check for cron routes that should no-op (not 500) pre-go-live.
  get anthropicConfigured() {
    return Boolean(optional("ANTHROPIC_API_KEY"));
  },
  get resolutionModel() {
    // Temporary: claude-fable-5 is unavailable (Jun 2026) — default the
    // resolution agent (and KB-grounded copilot drafting) to claude-opus-4-8
    // until it returns. Override anytime via the RESOLUTION_MODEL env var.
    return optional("RESOLUTION_MODEL", "claude-opus-4-8");
  },
  get utilityModel() {
    return optional("UTILITY_MODEL", "claude-haiku-4-5");
  },
  // The agent copilot's answer-touching tools (rephrase, the pre-send tone
  // check, translate) rewrite text a customer will read, so they run a step
  // above the utility model to preserve meaning reliably. Override via
  // COPILOT_MODEL; falls back to the utility model if this model errors.
  get copilotModel() {
    return optional("COPILOT_MODEL", "claude-sonnet-5");
  },
  get voyageApiKey() {
    return required("VOYAGE_API_KEY");
  },
  // True when the embedding/RAG service is wired. Lets KB publish degrade
  // gracefully (publish now, embed once the key lands) instead of crashing the
  // publish click before go-live — checked with optional() so it never throws.
  get voyageConfigured() {
    return Boolean(optional("VOYAGE_API_KEY"));
  },
  get embeddingModel() {
    return optional("EMBEDDING_MODEL", "voyage-3.5");
  },
  get rerankModel() {
    return optional("RERANK_MODEL", "rerank-2.5");
  },
  // Firecrawl + University (Duda blog) KB ingestion. Dormant until the API key
  // is set, so the sync route/cron is a safe no-op before then.
  get firecrawlApiKey() {
    return optional("FIRECRAWL_API_KEY");
  },
  get firecrawlConfigured() {
    return Boolean(optional("FIRECRAWL_API_KEY"));
  },
  get universityBaseUrl() {
    return optional("UNIVERSITY_BASE_URL", "https://university.travelgenix.io");
  },
  get universityPathPrefix() {
    return optional("UNIVERSITY_PATH_PREFIX"); // e.g. "/post" to restrict to blog posts
  },
  get universityBatch() {
    return Number(optional("UNIVERSITY_BATCH", "10"));
  },
  get universityAutopublish() {
    // false (default): land as 'review' for approval. true: embed + publish on
    // ingest so it's immediately usable by the AI.
    return optional("UNIVERSITY_AUTOPUBLISH") === "true";
  },
  get airtablePat() {
    return required("AIRTABLE_PAT");
  },
  // Creating a client company from the desk WRITES to the Clients base, so it
  // needs a write-scoped token — deliberately separate from the read-only
  // AIRTABLE_PAT (least privilege, per the security brief). The "Add a company"
  // UI stays dark until this is set. Point it at a dedicated PAT with
  // data.records:write on just the Clients base (recommended), or a widened
  // main token.
  get airtableWritePat() {
    return required("AIRTABLE_WRITE_PAT");
  },
  get airtableWriteConfigured() {
    return Boolean(optional("AIRTABLE_WRITE_PAT"));
  },
  // TG B2B CRM (Airtable base) — read seam for the Customer 360 care panel.
  // Set AIRTABLE_CRM_BASE_ID to switch it on; the token (AIRTABLE_CRM_PAT, else
  // the main read PAT) must have read access to that base. Dark until the base
  // id is set, so a missing CRM never breaks the ticket view.
  get airtableCrmBaseId() {
    return optional("AIRTABLE_CRM_BASE_ID");
  },
  get airtableCrmPat() {
    return optional("AIRTABLE_CRM_PAT") || required("AIRTABLE_PAT");
  },
  get crmConfigured() {
    return Boolean(optional("AIRTABLE_CRM_BASE_ID"));
  },
  // Write-back to the CRM (support summary on the Company + activity timeline).
  // Needs a WRITE-scoped token on the CRM base — separate from the read PAT.
  // Dark until AIRTABLE_CRM_WRITE_PAT is set (and the base id above).
  get airtableCrmWritePat() {
    return required("AIRTABLE_CRM_WRITE_PAT");
  },
  get crmWriteConfigured() {
    return Boolean(optional("AIRTABLE_CRM_BASE_ID") && optional("AIRTABLE_CRM_WRITE_PAT"));
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
  // Extra addresses that are also "us" — e.g. the underlying Workspace mailbox
  // when SUPPORT_EMAIL is a send-as alias (we send as help@travelgenix.io from
  // the help@agendas.group account). Used by the inbound loop-guard so we never
  // turn our own outbound into a ticket. Optional, comma-separated.
  get supportEmailAliases() {
    return csv("SUPPORT_EMAIL_ALIASES").map((e) => e.toLowerCase());
  },
  // True when the Gmail send path is fully configured. Lets notification email
  // + the morning digest stay dormant (a no-op) until the mailbox is wired —
  // checked with optional() so it never throws when Gmail isn't set up yet.
  get gmailConfigured() {
    return Boolean(
      optional("GMAIL_CLIENT_ID") &&
        optional("GMAIL_CLIENT_SECRET") &&
        optional("GMAIL_REFRESH_TOKEN") &&
        optional("SUPPORT_EMAIL"),
    );
  },
  get tgAuthSessionUrl() {
    return optional("TG_AUTH_SESSION_URL");
  },
  // Cross-domain SSO bridge — lets the desk run on help.travelgenix.io even
  // though the tg_session cookie is .travelify.io-scoped. All optional; the
  // bridge is dormant until AUTH_SESSION_SECRET + SSO_BRIDGE_URL are set.
  get authSessionSecret() {
    return optional("AUTH_SESSION_SECRET"); // HMAC key for handoff + desk-session tokens
  },
  get ssoBridgeUrl() {
    return optional("SSO_BRIDGE_URL").replace(/\/$/, ""); // *.travelify.io host of this app, e.g. https://auth.travelify.io
  },
  get ssoLoginUrl() {
    // Travelgenix id login for users with no session yet (confirmed by Andy,
    // 15 Jul 2026: the login page is /signin.html, not /login). The SSO bridge
    // appends ?redirect=<return-url>, so this page must honour a `redirect`
    // param. Override with SSO_LOGIN_URL if the path or return-param changes.
    return optional("SSO_LOGIN_URL", "https://id.travelify.io/signin.html");
  },
  // The client portal's own email-link sign-in ("magic link") — deliberately
  // independent of the Travelify master account, because many help-centre users
  // don't have one. Needs the session secret (sign/verify), the public base URL
  // (the link itself) and Gmail (to send it).
  get portalLoginConfigured() {
    return Boolean(optional("AUTH_SESSION_SECRET") && optional("APP_BASE_URL") && this.gmailConfigured);
  },
  get agentEmails() {
    return csv("AGENT_EMAILS").map((e) => e.toLowerCase());
  },
  // Owner-only surfaces (the build/progress dashboard). Defaults to the CEO;
  // override with OWNER_EMAILS (comma-separated) to widen access.
  get ownerEmails() {
    return csv("OWNER_EMAILS", "andy.speight@agendas.group").map((e) => e.toLowerCase());
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
  get aiShadowMode() {
    // Master hold, ON by default: while true the AI drafts every reply into the
    // Needs-review queue for a human to approve/send — it never emails the
    // customer itself. Set AI_SHADOW_MODE=false to hand control to the graduated
    // send-gate below (auto-send the safe, high-confidence ones; hold the rest).
    return optional("AI_SHADOW_MODE", "true") !== "false";
  },
  get aiAutosendConfidence() {
    // With shadow mode off, only answers at/above this confidence auto-send;
    // anything less is held in Needs-review. Lowered to 0.70 for the live trial
    // (safe intents only + mandatory-escalation guardrail still apply); raise via
    // AI_AUTOSEND_CONFIDENCE if the corrected-draft rate climbs.
    return Number(optional("AI_AUTOSEND_CONFIDENCE", "0.70"));
  },
  get aiAutosendIntents() {
    // …and only these intents auto-send (KB-answerable, low-risk). Everything
    // else always holds for review. Comma-separated; widen as confidence grows.
    return optional("AI_AUTOSEND_INTENTS", "how_to,content_seo,deeplinks")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get gmailPollBatch() {
    return Number(optional("GMAIL_POLL_BATCH", "10"));
  },
  // Inactivity chase on "waiting on customer" tickets: after REMIND_DAYS business
  // days of client silence send one reminder, after CLOSE_DAYS auto-close (reply
  // reopens). Templated system emails, so they run regardless of AI shadow mode.
  // Set INACTIVITY_CHASE=false to switch the whole thing off without a deploy.
  get inactivityChase() {
    return optional("INACTIVITY_CHASE", "true") !== "false";
  },
  get inactivityRemindDays() {
    const n = Number(optional("INACTIVITY_REMIND_DAYS", "3"));
    return Number.isFinite(n) && n > 0 ? n : 3;
  },
  get inactivityCloseDays() {
    const n = Number(optional("INACTIVITY_CLOSE_DAYS", "7"));
    return Number.isFinite(n) && n > 0 ? n : 7;
  },
};
