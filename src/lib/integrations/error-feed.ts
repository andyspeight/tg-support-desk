import "server-only";
import type { OutreachRecipient } from "@/lib/db/types";

/**
 * Supplier integration-error feed — the future auto-detection source for
 * proactive outreach.
 *
 * When the Phase 3 `get_integration_errors` pipeline (the existing
 * integrations@agendas.group / integration-error-report logic) is productised
 * into an API, implement `listIntegrationIncidents()` here and the Proactive
 * tab will surface detected supplier outages automatically — with the affected
 * clients pre-filled — so a human only reviews and sends. No UI rework needed:
 * this is the seam, matching the CRM/Luna read-seam pattern.
 *
 * Until then it returns nothing and the desk runs on human-raised incidents
 * (the team already learns of outages from the integrations@ monitoring).
 */

export type IntegrationIncident = {
  supplier: string;
  summary: string;
  detail?: string | null;
  detectedAt?: string;
  recipients: OutreachRecipient[];
};

export async function listIntegrationIncidents(): Promise<IntegrationIncident[]> {
  // STUB — no live feed wired yet. See the module doc comment.
  return [];
}
