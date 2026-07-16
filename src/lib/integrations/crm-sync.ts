import "server-only";
import { env } from "@/lib/env";
import {
  crmClientTickets,
  crmClientsRecentlyActive,
  crmPendingActivityTickets,
  markCrmActivityLogged,
  type CrmActivityTicket,
} from "@/lib/db/queries";
import { companyNameFrom, getClientById } from "./airtable-clients";
import { logSupportActivity, resolveCrmCompanyId, updateCompanySupportSummary } from "./crm-seam";
import { summariseClientSupport, type CrmSupportTicket } from "./crm-support";

// Hourly write-back to the CRM: refresh each active client's support summary on
// its Company, and log any resolved/escalated ticket to the Company's timeline.
// Path-independent (driven off ticket state, not a specific code path) and
// dedup-safe (crm_activity_at marks logged tickets).

const MAX_CLIENTS = 60; // bound the Airtable work per run
const DAY = 86_400_000;
const RECENT_WINDOW_MS = 90 * 60 * 1000; // refresh summaries for clients touched in the last 90 min

export type CrmSyncResult = { clients: number; summaries: number; activities: number; unmatched: number; errors: number };

export async function runCrmSync(now = Date.now()): Promise<CrmSyncResult> {
  const result: CrmSyncResult = { clients: 0, summaries: 0, activities: 0, unmatched: 0, errors: 0 };
  if (!env.crmWriteConfigured) return result;

  const pending = await crmPendingActivityTickets(100);
  const recentClients = await crmClientsRecentlyActive(new Date(now - RECENT_WINDOW_MS).toISOString());

  const clientIds = [...new Set([...pending.map((t) => t.client_id), ...recentClients])].slice(0, MAX_CLIENTS);
  result.clients = clientIds.length;
  if (clientIds.length === 0) return result;

  // Tickets for the summaries (last 90 days), grouped by client.
  const ticketRows = await crmClientTickets(clientIds, new Date(now - 90 * DAY).toISOString());
  const ticketsByClient = new Map<string, CrmSupportTicket[]>();
  for (const r of ticketRows) {
    const arr = ticketsByClient.get(r.client_id) ?? [];
    arr.push({ status: r.status, createdMs: new Date(r.created_at).getTime(), subject: r.subject, csat: r.csat_score });
    ticketsByClient.set(r.client_id, arr);
  }
  const pendingByClient = new Map<string, CrmActivityTicket[]>();
  for (const t of pending) {
    const arr = pendingByClient.get(t.client_id) ?? [];
    arr.push(t);
    pendingByClient.set(t.client_id, arr);
  }

  const logged: string[] = [];
  for (const clientId of clientIds) {
    const clientPending = pendingByClient.get(clientId) ?? [];
    try {
      const record = await getClientById(clientId).catch(() => null);
      const companyId = await resolveCrmCompanyId({ companyName: record ? companyNameFrom(record) : null });

      if (!companyId) {
        // No CRM company for this client — mark its pending tickets processed so
        // we don't re-scan them every hour (they'd only match once the company
        // exists in the CRM anyway).
        result.unmatched++;
        logged.push(...clientPending.map((t) => t.id));
        continue;
      }

      await updateCompanySupportSummary(companyId, summariseClientSupport(ticketsByClient.get(clientId) ?? [], now));
      result.summaries++;

      for (const t of clientPending) {
        const verb = t.status === "escalated" ? "escalated to a human" : "resolved";
        await logSupportActivity(companyId, {
          summary: `Support ticket #${t.reference} ${verb}: ${t.subject}`,
          detail: `Status: ${t.status}. Requester: ${t.requester_email}.`,
        });
        result.activities++;
        logged.push(t.id);
      }
    } catch (error) {
      console.error(`crm-sync client ${clientId} failed:`, error);
      result.errors++;
    }
  }

  await markCrmActivityLogged(logged).catch((e) => console.error("markCrmActivityLogged:", e));
  return result;
}
