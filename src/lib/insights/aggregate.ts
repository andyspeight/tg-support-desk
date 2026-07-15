// Pure aggregation for the insights snapshot — no server-only / db / network, so
// it stays unit-testable (the grounding + thresholds are correctness-critical:
// a cluster must never show a ticket that isn't really in it). compute.ts does
// the fetching and hands plain data here.

import type { ClientWatch, RepeatContact, TrendCluster, TrendTicketRef } from "./types";
import type { RawTheme } from "@/lib/ai/cluster-tickets";

export type InsightTicket = {
  id: string;
  reference: number;
  subject: string;
  intent: string | null;
  status: string;
  createdMs: number;
  clientId: string | null;
  email: string;
  name: string | null;
  csat: number | null;
  escalated: boolean;
};

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "theme";

const isNegative = (t: InsightTicket): boolean => t.csat !== null && t.csat <= 2;

function refOf(t: InsightTicket, nameFor: Map<string, string>): TrendTicketRef {
  return { id: t.id, reference: t.reference, subject: t.subject, clientName: t.clientId ? nameFor.get(t.clientId) ?? null : null };
}

/**
 * Turn the model's raw themes into grounded clusters: every reference must map
 * to a real trending ticket, duplicates are dropped, and only themes with `min`+
 * real tickets survive (the threshold is enforced here, never trusted from the
 * model). firstSeen/emerging carry across from the previous snapshot's keys.
 */
export function groundClusters(
  rawThemes: RawTheme[],
  trending: InsightTicket[],
  nameFor: Map<string, string>,
  priorFirstSeen: Map<string, string>,
  nowIso: string,
  min = 3,
): TrendCluster[] {
  const byRef = new Map(trending.map((t) => [t.reference, t]));
  const usedKeys = new Set<string>();
  const clusters: TrendCluster[] = [];
  for (const theme of rawThemes) {
    const seen = new Set<string>();
    const tickets: TrendTicketRef[] = [];
    for (const rn of theme.references) {
      const t = byRef.get(rn);
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        tickets.push(refOf(t, nameFor));
      }
    }
    if (tickets.length < min) continue;
    let key = slugify(theme.label);
    while (usedKeys.has(key)) key = `${key}-${tickets[0].reference}`;
    usedKeys.add(key);
    clusters.push({
      key,
      label: theme.label,
      description: theme.description,
      count: tickets.length,
      tickets,
      firstSeen: priorFirstSeen.get(key) ?? nowIso,
      emerging: !priorFirstSeen.has(key),
    });
  }
  return clusters.sort((a, b) => b.count - a.count);
}

function watchScore(c: ClientWatch): number {
  return c.flags.length * 100 + c.escalations * 3 + c.negativeCsat * 4 + c.reopens * 3 + c.count30;
}

/** Per-client health over the last 30 days vs the prior 30, flagged. */
export function computeClientsToWatch(
  last30: InsightTicket[],
  prev30: InsightTicket[],
  reopensByClient: Map<string, number>,
  nameFor: Map<string, string>,
  highVolume = 8,
): ClientWatch[] {
  const byClient = new Map<string, InsightTicket[]>();
  for (const t of last30) {
    if (!t.clientId) continue;
    const a = byClient.get(t.clientId) ?? [];
    a.push(t);
    byClient.set(t.clientId, a);
  }
  const prevCount = new Map<string, number>();
  for (const t of prev30) if (t.clientId) prevCount.set(t.clientId, (prevCount.get(t.clientId) ?? 0) + 1);

  return [...byClient.entries()]
    .map(([clientId, list]): ClientWatch => {
      const count30 = list.length;
      const countPrev30 = prevCount.get(clientId) ?? 0;
      const deltaPct = countPrev30 > 0 ? Math.round(((count30 - countPrev30) / countPrev30) * 100) : null;
      const escalations = list.filter((t) => t.escalated).length;
      const reopens = reopensByClient.get(clientId) ?? 0;
      const scored = list.filter((t) => t.csat !== null);
      const csatAvg = scored.length ? Math.round((scored.reduce((s, t) => s + (t.csat as number), 0) / scored.length) * 10) / 10 : null;
      const negativeCsat = list.filter(isNegative).length;
      const flags: string[] = [];
      if (count30 >= highVolume) flags.push("high-volume");
      if ((deltaPct !== null && deltaPct >= 50 && count30 >= 3) || (countPrev30 === 0 && count30 >= 5)) flags.push("rising");
      if (escalations >= 2) flags.push("escalations");
      if (negativeCsat >= 1) flags.push("negative-csat");
      if (reopens >= 2) flags.push("reopens");
      return { clientId, clientName: nameFor.get(clientId) ?? null, count30, countPrev30, deltaPct, escalations, reopens, csatAvg, negativeCsat, flags };
    })
    .filter((c) => c.count30 >= 2 || c.flags.length > 0)
    .sort((a, b) => watchScore(b) - watchScore(a))
    .slice(0, 15);
}

/** Same person, `min`+ tickets in the supplied window (frustration signal). */
export function computeRepeatContacts(windowTickets: InsightTicket[], nameFor: Map<string, string>, min = 3): RepeatContact[] {
  const byEmail = new Map<string, InsightTicket[]>();
  for (const t of windowTickets) {
    const k = t.email.toLowerCase();
    const a = byEmail.get(k) ?? [];
    a.push(t);
    byEmail.set(k, a);
  }
  return [...byEmail.entries()]
    .filter(([, l]) => l.length >= min)
    .map(([email, l]): RepeatContact => {
      const clientId = l.find((t) => t.clientId)?.clientId ?? null;
      return {
        email,
        name: l.find((t) => t.name)?.name ?? null,
        clientName: clientId ? nameFor.get(clientId) ?? null : null,
        count: l.length,
        tickets: l.slice(0, 8).map((t) => refOf(t, nameFor)),
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}
