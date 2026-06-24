import "server-only";
import { db } from "./client";
import { getKbEffectiveness } from "./queries";
import { kbArticleFlag } from "@/lib/kb-effectiveness";
import { env } from "@/lib/env";
import { ticketSla } from "@/lib/sla";
import type { SlaPolicy, TicketPriority } from "./types";

// True AI resolution rate and the supporting metrics — all derived from
// tickets (+ sla_policies). Reopens clear ai_resolved, so ai_resolved=true at
// query time already approximates "resolved with no human reply, not reopened"
// — the strict definition, minus the CSAT-not-negative clause applied below.

type Row = {
  status: string;
  ai_resolved: boolean;
  intent: string | null;
  priority: TicketPriority;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  csat_score: number | null;
  client_id: string | null;
  escalation_reason: string | null;
};

export type Analytics = {
  connected: boolean;
  totals: { tickets: number; resolved: number; aiResolved: number; escalated: number };
  aiResolutionRate: number | null;
  aiResolutionRateStrict: number | null;
  byIntent: { intent: string; total: number; aiResolved: number; rate: number }[];
  firstResponseMins: { avg: number; median: number } | null;
  resolutionHours: { avg: number; median: number } | null;
  sla: { measured: number; metPct: number } | null;
  csat: { count: number; avg: number; aiAvg: number | null; humanAvg: number | null } | null;
  escalationReasons: { reason: string; count: number }[];
  topClients: { clientId: string; count: number }[];
};

const EMPTY: Analytics = {
  connected: false,
  totals: { tickets: 0, resolved: 0, aiResolved: 0, escalated: 0 },
  aiResolutionRate: null,
  aiResolutionRateStrict: null,
  byIntent: [],
  firstResponseMins: null,
  resolutionHours: null,
  sla: null,
  csat: null,
  escalationReasons: [],
  topClients: [],
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const avg = (values: number[]): number => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);
const pct = (num: number, denom: number): number => (denom > 0 ? Math.round((num / denom) * 100) : 0);

export async function getAnalytics(): Promise<Analytics> {
  try {
    const client = db();
    const tenant = env.tenantId;

    const [ticketsRes, policiesRes] = await Promise.all([
      client
        .from("tickets")
        .select(
          "status, ai_resolved, intent, priority, created_at, first_response_at, resolved_at, csat_score, client_id, escalation_reason",
        )
        .eq("tenant_id", tenant)
        .order("created_at", { ascending: false })
        .limit(5000),
      client.from("sla_policies").select().eq("tenant_id", tenant),
    ]);
    if (ticketsRes.error) throw new Error(ticketsRes.error.message);

    const rows = (ticketsRes.data as Row[]) ?? [];
    const policies = new Map<TicketPriority, SlaPolicy>(
      ((policiesRes.data as SlaPolicy[]) ?? []).map((p) => [p.priority, p]),
    );

    const resolved = rows.filter((r) => r.status === "resolved" || r.status === "closed");
    const aiResolved = resolved.filter((r) => r.ai_resolved);
    const aiResolvedStrict = aiResolved.filter((r) => r.csat_score === null || r.csat_score >= 3);
    const escalated = rows.filter((r) => r.status === "escalated");

    // By intent
    const intentMap = new Map<string, { total: number; ai: number }>();
    for (const r of resolved) {
      const key = r.intent ?? "untriaged";
      const cur = intentMap.get(key) ?? { total: 0, ai: 0 };
      cur.total += 1;
      if (r.ai_resolved) cur.ai += 1;
      intentMap.set(key, cur);
    }
    const byIntent = [...intentMap.entries()]
      .map(([intent, v]) => ({ intent, total: v.total, aiResolved: v.ai, rate: pct(v.ai, v.total) }))
      .sort((a, b) => b.total - a.total);

    // First response (minutes) and full resolution (hours)
    const frMins = rows
      .filter((r) => r.first_response_at)
      .map((r) => (new Date(r.first_response_at!).getTime() - new Date(r.created_at).getTime()) / 60000)
      .filter((m) => m >= 0);
    const resHours = resolved
      .filter((r) => r.resolved_at)
      .map((r) => (new Date(r.resolved_at!).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
      .filter((h) => h >= 0);

    // SLA compliance over resolved tickets (both clocks met, not late)
    let slaMeasured = 0;
    let slaMet = 0;
    for (const r of resolved) {
      const policy = policies.get(r.priority);
      if (!policy) continue;
      slaMeasured += 1;
      const s = ticketSla({
        createdAt: r.created_at,
        firstResponseAt: r.first_response_at,
        resolvedAt: r.resolved_at,
        firstResponseMinutes: policy.first_response_minutes,
        resolveMinutes: policy.resolve_minutes,
        businessHours: policy.business_hours,
      });
      if (s.firstResponse.state === "met" && s.resolve.state === "met") slaMet += 1;
    }

    // CSAT
    const scored = resolved.filter((r) => r.csat_score !== null);
    const aiScores = scored.filter((r) => r.ai_resolved).map((r) => r.csat_score!);
    const humanScores = scored.filter((r) => !r.ai_resolved).map((r) => r.csat_score!);

    // Escalation Pareto
    const reasonMap = new Map<string, number>();
    for (const r of rows) {
      if (!r.escalation_reason) continue;
      const key = r.escalation_reason.split(":")[0].trim() || "other";
      reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
    }
    const escalationReasons = [...reasonMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Volume by client
    const clientMap = new Map<string, number>();
    for (const r of rows) {
      if (!r.client_id) continue;
      clientMap.set(r.client_id, (clientMap.get(r.client_id) ?? 0) + 1);
    }
    const topClients = [...clientMap.entries()]
      .map(([clientId, count]) => ({ clientId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      connected: true,
      totals: {
        tickets: rows.length,
        resolved: resolved.length,
        aiResolved: aiResolved.length,
        escalated: escalated.length,
      },
      aiResolutionRate: resolved.length ? pct(aiResolved.length, resolved.length) : null,
      aiResolutionRateStrict: resolved.length ? pct(aiResolvedStrict.length, resolved.length) : null,
      byIntent,
      firstResponseMins: frMins.length ? { avg: avg(frMins), median: median(frMins) } : null,
      resolutionHours: resHours.length ? { avg: avg(resHours), median: median(resHours) } : null,
      sla: slaMeasured ? { measured: slaMeasured, metPct: pct(slaMet, slaMeasured) } : null,
      csat: scored.length
        ? {
            count: scored.length,
            avg: Math.round((scored.reduce((a, r) => a + r.csat_score!, 0) / scored.length) * 10) / 10,
            aiAvg: aiScores.length ? Math.round((aiScores.reduce((a, b) => a + b, 0) / aiScores.length) * 10) / 10 : null,
            humanAvg: humanScores.length
              ? Math.round((humanScores.reduce((a, b) => a + b, 0) / humanScores.length) * 10) / 10
              : null,
          }
        : null,
      escalationReasons,
      topClients,
    };
  } catch {
    return EMPTY;
  }
}

// ── Weekly gap digest (brief §8: the improvement-loop email) ──────────────────
// Distinct from the daily morning-digest (per-agent triage). This is the weekly
// "where is the AI struggling + what needs reviewing" summary for Andy/agents.

export type WeeklyGapDigest = {
  thisWeek: { created: number; resolved: number; aiResolved: number; aiRatePct: number | null };
  lastWeekAiRatePct: number | null;
  topEscalationReasons: { reason: string; count: number }[];
  failingIntents: { intent: string; total: number; aiRate: number }[];
  kbReview: { count: number; titles: string[] };
  /** Published articles that get used but don't resolve — flag for revision. */
  articlesToReview: { title: string; cited: number; resolveRate: number | null }[];
};

type DigestRow = Pick<Row, "status" | "ai_resolved" | "intent" | "created_at" | "csat_score" | "escalation_reason">;

/** Cohorted by creation date: "this week" = tickets created in the last 7 days,
 *  with the prior 7 days as the trend baseline. Returns null on any error so the
 *  cron can skip cleanly. */
export async function getWeeklyGapDigest(): Promise<WeeklyGapDigest | null> {
  try {
    const client = db();
    const tenant = env.tenantId;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const since = new Date(now - 2 * WEEK_MS).toISOString();

    const [ticketsRes, kbCountRes, kbTitlesRes] = await Promise.all([
      client
        .from("tickets")
        .select("status, ai_resolved, intent, created_at, csat_score, escalation_reason")
        .eq("tenant_id", tenant)
        .gte("created_at", since)
        .limit(5000),
      client.from("kb_articles").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("status", "review"),
      client
        .from("kb_articles")
        .select("title")
        .eq("tenant_id", tenant)
        .eq("status", "review")
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);
    if (ticketsRes.error) throw new Error(ticketsRes.error.message);

    const rows = (ticketsRes.data as DigestRow[]) ?? [];
    const cutoff = now - WEEK_MS;
    const isThisWeek = (r: DigestRow) => new Date(r.created_at).getTime() >= cutoff;

    const cohortRate = (set: DigestRow[]) => {
      const done = set.filter((r) => r.status === "resolved" || r.status === "closed");
      const ai = done.filter((r) => r.ai_resolved && (r.csat_score === null || r.csat_score >= 3));
      return { resolved: done.length, aiResolved: ai.length, ratePct: done.length ? pct(ai.length, done.length) : null };
    };

    const thisWeekRows = rows.filter(isThisWeek);
    const tw = cohortRate(thisWeekRows);
    const lw = cohortRate(rows.filter((r) => !isThisWeek(r)));

    const reasonMap = new Map<string, number>();
    for (const r of thisWeekRows) {
      if (!r.escalation_reason) continue;
      const key = r.escalation_reason.split(":")[0].trim() || "other";
      reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
    }
    const topEscalationReasons = [...reasonMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const intentMap = new Map<string, { total: number; ai: number }>();
    for (const r of thisWeekRows.filter((r) => r.status === "resolved" || r.status === "closed")) {
      const key = r.intent ?? "untriaged";
      const cur = intentMap.get(key) ?? { total: 0, ai: 0 };
      cur.total += 1;
      if (r.ai_resolved) cur.ai += 1;
      intentMap.set(key, cur);
    }
    const failingIntents = [...intentMap.entries()]
      .map(([intent, v]) => ({ intent, total: v.total, aiRate: pct(v.ai, v.total) }))
      .filter((x) => x.total >= 2 && x.aiRate < 70)
      .sort((a, b) => a.aiRate - b.aiRate)
      .slice(0, 5);

    const titles = ((kbTitlesRes.data as { title: string }[] | null) ?? []).map((r) => r.title);

    // Articles that get cited but don't resolve / draw negative CSAT — the
    // self-correcting signal: fix or retire these.
    const eff = await getKbEffectiveness();
    const flagged = [...eff.values()].filter((e) => kbArticleFlag(e) === "review");
    let articlesToReview: WeeklyGapDigest["articlesToReview"] = [];
    if (flagged.length) {
      const { data: titleRows } = await client
        .from("kb_articles")
        .select("id, title")
        .in(
          "id",
          flagged.map((e) => e.article_id),
        );
      const titleById = new Map(((titleRows as { id: string; title: string }[] | null) ?? []).map((r) => [r.id, r.title]));
      articlesToReview = flagged
        .sort((a, b) => (a.resolveRate ?? 0) - (b.resolveRate ?? 0))
        .slice(0, 5)
        .map((e) => ({ title: titleById.get(e.article_id) ?? "(untitled)", cited: e.cited, resolveRate: e.resolveRate }));
    }

    return {
      thisWeek: { created: thisWeekRows.length, resolved: tw.resolved, aiResolved: tw.aiResolved, aiRatePct: tw.ratePct },
      lastWeekAiRatePct: lw.ratePct,
      topEscalationReasons,
      failingIntents,
      kbReview: { count: kbCountRes.count ?? 0, titles },
      articlesToReview,
    };
  } catch {
    return null;
  }
}
