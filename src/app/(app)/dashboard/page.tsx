import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getDashboardStats } from "@/lib/db/stats";
import { RESOLUTION_MILESTONES, ROADMAP, stageStatus, type RoadmapItemStatus } from "@/lib/roadmap";
import { RefreshPoller } from "@/components/refresh-poller";

const ITEM_DOT: Record<RoadmapItemStatus, string> = {
  done: "bg-emerald-500",
  in_progress: "bg-accent-500",
  blocked: "bg-amber-500",
  todo: "bg-ink-3",
};

const ITEM_TEXT: Record<RoadmapItemStatus, string> = {
  done: "text-ink",
  in_progress: "text-ink font-medium",
  blocked: "text-ink",
  todo: "text-ink-3",
};

function StatCard({ label, value, accent, href }: { label: string; value: string; accent?: boolean; href?: string }) {
  const body = (
    <div className={`rounded-lg border bg-surface p-4 ${accent ? "border-accent-200 dark:border-accent-500/25" : "border-line"} ${href ? "hover:border-ink-3" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-accent-700 dark:text-accent-300" : "text-ink"}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  // Owner-only view (the build/progress roadmap). Other agents are sent to My day.
  const session = await getSession();
  if (!session || !env.ownerEmails.includes(session.email)) redirect("/home");

  const stats = await getDashboardStats();
  const rate = stats.aiResolutionPct ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <RefreshPoller intervalMs={30000} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className="text-xs text-ink-3">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      {!stats.connected && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          Database not reachable yet — live stats appear once the environment credentials are configured
          (Stage 1). The roadmap below is current either way.
        </div>
      )}

      {/* Live operations */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open tickets" value={String(stats.open)} href="/inbox?view=open" />
        <StatCard label="Needs a human" value={String(stats.escalated)} href="/inbox?view=escalated" />
        <StatCard label="Waiting on customer" value={String(stats.waiting)} href="/inbox?view=waiting" />
        <StatCard label="Breaching SLA" value={String(stats.breaching)} href="/inbox?view=breaching" />
        <StatCard label="Resolved today" value={String(stats.resolvedToday)} />
        <StatCard
          label="AI resolution to date"
          value={stats.aiResolutionPct === null ? "—" : `${stats.aiResolutionPct}%`}
          accent
        />
        <StatCard
          label="AI resolved / all resolved"
          value={`${stats.aiResolved} / ${stats.resolvedAll}`}
        />
        <StatCard
          label="Avg first response"
          value={stats.avgFirstResponseMinutes === null ? "—" : `${stats.avgFirstResponseMinutes}m`}
        />
        <StatCard label="KB published · in review" value={`${stats.kb.published} · ${stats.kb.review}`} href="/kb" />
      </div>

      {/* The ratchet */}
      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Resolution ratchet — target 70%+ with no human reply</h2>
          <span className="text-xs text-ink-3">strict: no human reply · no 72h reopen · CSAT not negative</span>
        </div>
        <div className="relative mt-6 h-3 rounded-full bg-surface-2">
          <div
            className="absolute h-3 rounded-full bg-accent-500 transition-all"
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
          {RESOLUTION_MILESTONES.map((m) => (
            <div key={m.pct} className="absolute -top-1.5" style={{ left: `${m.pct}%` }}>
              <div className={`h-6 w-0.5 ${rate >= m.pct ? "bg-emerald-500" : "bg-ink-3"}`} />
              <div className="absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-3">
                <span className="font-semibold text-ink-2">{m.pct}%</span> {m.label}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-9 text-xs text-ink-2">
          Currently <span className="font-semibold text-accent-700 dark:text-accent-300">{stats.aiResolutionPct === null ? "no resolved tickets yet" : `${rate}%`}</span>
          {stats.escalationReasons.length > 0 && (
            <span>
              {" "}· top escalation causes:{" "}
              {stats.escalationReasons.map((r) => `${r.reason} (${r.count})`).join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Roadmap */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Build roadmap</h2>
          <span className="text-xs text-ink-3">
            full plan: <code className="rounded bg-surface-2 px-1">docs/DEVELOPMENT-PLAN.md</code>
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {ROADMAP.map((stage) => {
            const status = stageStatus(stage);
            const done = stage.items.filter((i) => i.status === "done").length;
            const pct = Math.round((done / stage.items.length) * 100);
            return (
              <details
                key={stage.id}
                open={status === "in_progress"}
                className="group rounded-lg border border-line bg-surface"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      status === "done"
                        ? "bg-emerald-500 text-white"
                        : status === "in_progress"
                          ? "bg-brand-600 text-white dark:bg-brand-500"
                          : "bg-surface-2 text-ink-3"
                    }`}
                  >
                    {status === "done" ? <Check className="h-4 w-4" strokeWidth={2.5} /> : stage.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      Stage {stage.id} — {stage.name}
                    </span>
                    <span className="block truncate text-xs text-ink-3">{stage.target}</span>
                  </span>
                  <span className="hidden w-40 shrink-0 sm:block">
                    <span className="block h-1.5 rounded-full bg-surface-2">
                      <span
                        className={`block h-1.5 rounded-full ${status === "done" ? "bg-emerald-500" : "bg-accent-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-3">
                    {done}/{stage.items.length}
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-90" strokeWidth={1.75} />
                </summary>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-line-soft px-4 py-3 sm:grid-cols-2">
                  {stage.items.map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ITEM_DOT[item.status]}`} />
                      <span className={`truncate ${ITEM_TEXT[item.status]}`}>{item.label}</span>
                      {item.note && <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">{item.note}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-ink-3">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> done</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent-500" /> in progress</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> blocked — needs Andy</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink-3" /> up next</span>
        </div>
      </div>
    </div>
  );
}
