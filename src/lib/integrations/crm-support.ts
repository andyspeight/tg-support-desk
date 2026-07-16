// Pure support-summary computation for the CRM write-back — no server-only / db,
// so it stays unit-testable. crm-sync fetches the tickets and hands them here.

export type SupportSummary = {
  openTickets: number;
  tickets30d: number;
  lastIssue: string | null;
  lastContact: string | null; // YYYY-MM-DD
  sentiment: "Improving" | "Stable" | "Declining" | null;
};

export type CrmSupportTicket = {
  status: string;
  createdMs: number;
  subject: string;
  csat: number | null;
};

// Statuses that count as an open ticket for the summary count.
const OPEN_STATUSES = new Set(["new", "ai_working", "waiting_on_customer", "pending", "escalated", "needs_review"]);
const DAY = 86_400_000;

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Trend from recent CSAT: 2+ negatives outweighing positives → declining, the
 *  mirror → improving, otherwise stable. Neutral "Stable" when there are tickets
 *  but no ratings; null only when the client has no tickets at all. */
function computeSentiment(recent: CrmSupportTicket[]): SupportSummary["sentiment"] {
  const rated = recent.filter((t) => t.csat !== null);
  if (rated.length === 0) return "Stable";
  const neg = rated.filter((t) => (t.csat as number) <= 2).length;
  const pos = rated.filter((t) => (t.csat as number) >= 4).length;
  if (neg >= 2 && neg > pos) return "Declining";
  if (pos >= 2 && pos > neg) return "Improving";
  return "Stable";
}

export function summariseClientSupport(tickets: CrmSupportTicket[], nowMs: number): SupportSummary {
  if (tickets.length === 0) {
    return { openTickets: 0, tickets30d: 0, lastIssue: null, lastContact: null, sentiment: null };
  }
  const cut30 = nowMs - 30 * DAY;
  const recent = tickets.filter((t) => t.createdMs >= cut30);
  const latest = tickets.reduce((a, b) => (b.createdMs > a.createdMs ? b : a));
  return {
    openTickets: tickets.filter((t) => OPEN_STATUSES.has(t.status)).length,
    tickets30d: recent.length,
    lastIssue: latest.subject || null,
    lastContact: isoDate(latest.createdMs),
    sentiment: computeSentiment(recent),
  };
}
