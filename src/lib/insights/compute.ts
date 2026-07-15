import "server-only";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getTrendSnapshot } from "@/lib/db/queries";
import { getClientById, companyNameFrom } from "@/lib/integrations/airtable-clients";
import { listIntegrationIncidents } from "@/lib/integrations/error-feed";
import { clusterTickets, type ClusterInput } from "@/lib/ai/cluster-tickets";
import { computeClientsToWatch, computeRepeatContacts, groundClusters, type InsightTicket } from "./aggregate";
import type { InsightsSnapshot, NegativeSpike, SupplierCorrelation } from "./types";

// Thresholds — tunable. "3+ in 5 days" matches the brief's trending example.
const WINDOW_DAYS = 5; // trending-issue window
const CLUSTER_MIN = 3; // tickets needed for a theme to surface
const REPEAT_WINDOW_DAYS = 7; // repeat-contact window
const NAME_RESOLVE_CAP = 80; // Airtable lookups per run (bounded)
const DAY = 86_400_000;

type Row = {
  id: string;
  reference: number;
  subject: string;
  intent: string | null;
  status: string;
  created_at: string;
  client_id: string | null;
  requester_email: string;
  requester_name: string | null;
  csat_score: number | null;
  escalation_reason: string | null;
  tags: string[] | null;
};

// Spam / held-for-approval aren't real support volume (mirrors analytics.ts).
const isRealTicket = (r: Row): boolean => r.status !== "awaiting_approval" && !(r.tags ?? []).includes("spam");

const toInsightTicket = (r: Row): InsightTicket => ({
  id: r.id,
  reference: r.reference,
  subject: r.subject,
  intent: r.intent,
  status: r.status,
  createdMs: new Date(r.created_at).getTime(),
  clientId: r.client_id,
  email: r.requester_email,
  name: r.requester_name,
  csat: r.csat_score,
  escalated: r.status === "escalated" || Boolean(r.escalation_reason),
});

/** Resolve a bounded set of client rec ids → company names (best-effort, most-
 *  active first). Unresolved ids fall back to the id in the UI. */
async function resolveClientNames(idsByFrequency: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    idsByFrequency.slice(0, NAME_RESOLVE_CAP).map(async (id) => {
      try {
        const rec = await getClientById(id);
        if (rec) out.set(id, companyNameFrom(rec));
      } catch {
        /* leave unresolved */
      }
    }),
  );
  return out;
}

export async function computeInsights(now = Date.now()): Promise<InsightsSnapshot> {
  const client = db();
  const tenant = env.tenantId;
  const since = new Date(now - 60 * DAY).toISOString();

  const { data, error } = await client
    .from("tickets")
    .select(
      "id, reference, subject, intent, status, created_at, client_id, requester_email, requester_name, csat_score, escalation_reason, tags",
    )
    .eq("tenant_id", tenant)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`computeInsights tickets: ${error.message}`);
  const tickets = ((data as Row[]) ?? []).filter(isRealTicket).map(toInsightTicket);

  const trendingCut = now - WINDOW_DAYS * DAY;
  const last30Cut = now - 30 * DAY;
  const repeatCut = now - REPEAT_WINDOW_DAYS * DAY;
  const trending = tickets.filter((t) => t.createdMs >= trendingCut);
  const last30 = tickets.filter((t) => t.createdMs >= last30Cut);
  const prev30 = tickets.filter((t) => t.createdMs < last30Cut);
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  // Reopen events (customer bounced a resolved ticket back open) — the audit log
  // is the honest source. Best-effort; never blocks the snapshot.
  let reopenEvents: { ticketId: string; at: number }[] = [];
  try {
    const { data: reopens } = await client
      .from("audit_log")
      .select("target_id, created_at")
      .eq("tenant_id", tenant)
      .eq("action", "ticket.reopened")
      .gte("created_at", new Date(last30Cut).toISOString())
      .limit(3000);
    reopenEvents = ((reopens as { target_id: string | null; created_at: string }[]) ?? [])
      .filter((e) => e.target_id)
      .map((e) => ({ ticketId: e.target_id as string, at: new Date(e.created_at).getTime() }));
  } catch {
    /* reopens stay 0 */
  }
  const reopensByClient = new Map<string, number>();
  for (const e of reopenEvents) {
    const t = ticketById.get(e.ticketId);
    if (t?.clientId) reopensByClient.set(t.clientId, (reopensByClient.get(t.clientId) ?? 0) + 1);
  }

  // Names: resolve the clients we'll render, most-active first.
  const freq = new Map<string, number>();
  for (const t of last30) if (t.clientId) freq.set(t.clientId, (freq.get(t.clientId) ?? 0) + 1);
  const nameFor = await resolveClientNames([...freq.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id));

  // Trending clusters — AI labels + groups; we ground + threshold in code.
  const prior = await getTrendSnapshot().catch(() => null);
  const priorFirstSeen = new Map<string, string>();
  for (const c of prior?.payload.clusters ?? []) priorFirstSeen.set(c.key, c.firstSeen);
  const clusterInput: ClusterInput[] = trending.map((t) => ({ reference: t.reference, subject: t.subject, intent: t.intent }));
  const rawThemes = env.anthropicConfigured
    ? await clusterTickets(clusterInput, { apiKey: env.anthropicApiKey, model: env.utilityModel })
    : [];
  const nowIso = new Date(now).toISOString();
  const clusters = groundClusters(rawThemes, trending, nameFor, priorFirstSeen, nowIso, CLUSTER_MIN);

  const clientsToWatch = computeClientsToWatch(last30, prev30, reopensByClient, nameFor);
  const repeatContacts = computeRepeatContacts(
    tickets.filter((t) => t.createdMs >= repeatCut),
    nameFor,
  );

  // Negative-experience trend (overall, last 7d vs prior 7d).
  const inWin = (lo: number, hi: number) => (ms: number) => ms >= now - hi * DAY && ms < now - lo * DAY;
  const last7 = inWin(0, 7);
  const prev7 = inWin(7, 14);
  const neg = (t: InsightTicket) => t.csat !== null && t.csat <= 2;
  const negCsatLast7 = last30.filter((t) => neg(t) && last7(t.createdMs)).length;
  const reopensLast7 = reopenEvents.filter((e) => last7(e.at)).length;
  const negLast7 = negCsatLast7 + reopensLast7;
  const negPrev7 = last30.filter((t) => neg(t) && prev7(t.createdMs)).length + reopenEvents.filter((e) => prev7(e.at)).length;
  const negativeSpikes: NegativeSpike[] = [];
  if (negLast7 >= 3 && negLast7 > negPrev7) {
    negativeSpikes.push({ scope: "overall", clientId: null, clientName: null, reopens: reopensLast7, negativeCsat: negCsatLast7, windowDays: 7 });
  }

  // Supplier-error correlation (forward-looking; empty until the feed is wired).
  const supplierCorrelations: SupplierCorrelation[] = [];
  try {
    const incidents = await listIntegrationIncidents();
    for (const inc of incidents) {
      const emails = new Set(inc.recipients.map((r) => r.email.toLowerCase()));
      const domains = new Set([...emails].map((e) => e.split("@")[1]).filter(Boolean));
      for (const c of clusters) {
        const overlap = c.tickets.filter((tk) => {
          const t = ticketById.get(tk.id);
          if (!t) return false;
          const email = t.email.toLowerCase();
          return emails.has(email) || domains.has(email.split("@")[1]);
        }).length;
        if (overlap > 0) {
          supplierCorrelations.push({
            clusterKey: c.key,
            clusterLabel: c.label,
            supplier: inc.supplier,
            summary: inc.summary,
            detectedAt: inc.detectedAt ?? null,
            overlapCount: overlap,
          });
        }
      }
    }
  } catch {
    /* feed unavailable */
  }

  return {
    version: 1,
    computedAt: nowIso,
    windowDays: WINDOW_DAYS,
    ticketsAnalysed: trending.length,
    clusters,
    clientsToWatch,
    repeatContacts,
    negativeSpikes,
    supplierCorrelations,
    computed: true,
  };
}
