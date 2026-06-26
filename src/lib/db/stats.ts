import "server-only";
import { db } from "./client";
import { listBreachingTickets } from "./queries";
import { env } from "@/lib/env";

export type DashboardStats = {
  connected: boolean;
  open: number;
  escalated: number;
  waiting: number;
  breaching: number;
  resolvedToday: number;
  resolvedAll: number;
  aiResolved: number;
  /** ai-resolved share of all resolved/closed tickets, to date. */
  aiResolutionPct: number | null;
  avgFirstResponseMinutes: number | null;
  escalationReasons: { reason: string; count: number }[];
  kb: { published: number; review: number };
};

const EMPTY: DashboardStats = {
  connected: false,
  open: 0,
  escalated: 0,
  waiting: 0,
  breaching: 0,
  resolvedToday: 0,
  resolvedAll: 0,
  aiResolved: 0,
  aiResolutionPct: null,
  avgFirstResponseMinutes: null,
  escalationReasons: [],
  kb: { published: 0, review: 0 },
};

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const client = db();
    const tenant = env.tenantId;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const tickets = () => client.from("tickets").select("id", { count: "exact", head: true }).eq("tenant_id", tenant);
    const kb = (status: "published" | "review") =>
      client.from("kb_articles").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("status", status);

    const [open, escalated, waiting, breaching, resolvedToday, resolvedAll, aiResolved, kbPublished, kbReview, reasons, firstResponses] =
      await Promise.all([
        tickets().in("status", ["new", "ai_working", "waiting_on_customer", "escalated", "pending"]),
        tickets().eq("status", "escalated"),
        tickets().eq("status", "waiting_on_customer"),
        listBreachingTickets(),
        tickets().in("status", ["resolved", "closed"]).gte("resolved_at", startOfDay.toISOString()),
        tickets().in("status", ["resolved", "closed"]),
        tickets().in("status", ["resolved", "closed"]).eq("ai_resolved", true),
        kb("published"),
        kb("review"),
        client
          .from("tickets")
          .select("escalation_reason")
          .eq("tenant_id", tenant)
          .not("escalation_reason", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
        client
          .from("tickets")
          .select("created_at, first_response_at")
          .eq("tenant_id", tenant)
          .not("first_response_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

    const reasonCounts = new Map<string, number>();
    for (const row of reasons.data ?? []) {
      const key = (row.escalation_reason ?? "").split(":")[0].trim() || "other";
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }
    const escalationReasons = [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const responseTimes = (firstResponses.data ?? [])
      .map((row) => new Date(row.first_response_at!).getTime() - new Date(row.created_at).getTime())
      .filter((ms) => ms >= 0);
    const avgFirstResponseMinutes = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 60000)
      : null;

    const resolved = resolvedAll.count ?? 0;
    const ai = aiResolved.count ?? 0;

    return {
      connected: true,
      open: open.count ?? 0,
      escalated: escalated.count ?? 0,
      waiting: waiting.count ?? 0,
      breaching: breaching.length,
      resolvedToday: resolvedToday.count ?? 0,
      resolvedAll: resolved,
      aiResolved: ai,
      aiResolutionPct: resolved > 0 ? Math.round((ai / resolved) * 100) : null,
      avgFirstResponseMinutes,
      escalationReasons,
      kb: { published: kbPublished.count ?? 0, review: kbReview.count ?? 0 },
    };
  } catch {
    return EMPTY; // env not configured yet — dashboard renders the roadmap regardless
  }
}
