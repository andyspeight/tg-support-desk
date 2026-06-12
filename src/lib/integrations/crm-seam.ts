import "server-only";

/**
 * Typed read/write seam to the TG B2B CRM (repo tg-b2b-crm, Projects row
 * rec1yoddf4IwqaPGi). The CRM is in build — these stubs define the contract
 * now and get wired to its API in Phase 2/4.
 */

export type CrmCareSignal = {
  careStatus: string;
  healthFlag: "green" | "amber" | "red";
  lastCareTouch: string | null;
  nextCareTouch: string | null;
  openDeals: number;
};

export type SupportSignal = {
  clientId: string;
  openTickets: number;
  ticketsLast30Days: number;
  lastIssueSummary: string;
  sentimentTrend: "improving" | "stable" | "declining";
};

/** Customer 360 panel (Phase 2): care-programme status for a client. */
export async function getCareSignal(clientId: string): Promise<CrmCareSignal | null> {
  void clientId;
  return null; // stub until the CRM exposes a read API
}

/** Churn early-warning (Phase 4): push a support signal on ticket close. */
export async function pushSupportSignal(signal: SupportSignal): Promise<void> {
  void signal; // no-op stub until the CRM exposes a write API
}
