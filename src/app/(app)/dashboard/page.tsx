import Link from "next/link";
import { getDashboardStats } from "@/lib/db/stats";
import { RESOLUTION_MILESTONES, ROADMAP, stageStatus, type RoadmapItemStatus } from "@/lib/roadmap";
import { RefreshPoller } from "@/components/refresh-poller";

const ITEM_DOT: Record<RoadmapItemStatus, string> = {
  done: "bg-emerald-500",
  in_progress: "bg-accent-500",
  blocked: "bg-amber-500",
  todo: "bg-zinc-300",
};

const ITEM_TEXT: Record<RoadmapItemStatus, string> = {
  done: "text-zinc-700",
  in_progress: "text-zinc-900 font-medium",
  blocked: "text-zinc-700",
  todo: "text-zinc-400",
};

function StatCard({ label, value, accent, href }: { label: string; value: string; accent?: boolean; href?: string }) {
  const body = (
    <div className={`rounded-lg border bg-white p-4 ${accent ? "border-accent-200" : "border-zinc-200"} ${href ? "hover:border-zinc-400" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-accent-700" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const rate = stats.aiResolutionPct ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <RefreshPoller intervalMs={30000} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className="text-xs text-zinc-400">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      {!stats.connected && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Resolution ratchet — target 70%+ with no human reply</h2>
          <span className="text-xs text-zinc-400">strict: no human reply · no 72h reopen · CSAT not negative</span>
        </div>
        <div className="relative mt-6 h-3 rounded-full bg-zinc-100">
          <div
            className="absolute h-3 rounded-full bg-accent-500 transition-all"
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
          {RESOLUTION_MILESTONES.map((m) => (
            <div key={m.pct} className="absolute -top-1.5" style={{ left: `${m.pct}%` }}>
              <div className={`h-6 w-0.5 ${rate >= m.pct ? "bg-emerald-500" : "bg-zinc-400"}`} />
              <div className="absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap text-[10px] text-zinc-400">
                <span className="font-semibold text-zinc-600">{m.pct}%</span> {m.label}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-9 text-xs text-zinc-500">
          Currently <span className="font-semibold text-accent-700">{stats.aiResolutionPct === null ? "no resolved tickets yet" : `${rate}%`}</span>
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
          <span className="text-xs text-zinc-400">
            full plan: <code className="rounded bg-zinc-100 px-1">docs/DEVELOPMENT-PLAN.md</code>
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
                className="group rounded-lg border border-zinc-200 bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      status === "done"
                        ? "bg-emerald-500 text-white"
                        : status === "in_progress"
                          ? "bg-brand-600 text-white"
                          : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {status === "done" ? "✓" : stage.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900">
                      Stage {stage.id} — {stage.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">{stage.target}</span>
                  </span>
                  <span className="hidden w-40 shrink-0 sm:block">
                    <span className="block h-1.5 rounded-full bg-zinc-100">
                      <span
                        className={`block h-1.5 rounded-full ${status === "done" ? "bg-emerald-500" : "bg-accent-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-400">
                    {done}/{stage.items.length}
                  </span>
                  <span className="text-zinc-300 transition-transform group-open:rotate-90">›</span>
                </summary>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-zinc-100 px-4 py-3 sm:grid-cols-2">
                  {stage.items.map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ITEM_DOT[item.status]}`} />
                      <span className={`truncate ${ITEM_TEXT[item.status]}`}>{item.label}</span>
                      {item.note && <span className="shrink-0 text-xs text-amber-600">{item.note}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> done</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent-500" /> in progress</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> blocked — needs Andy</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-zinc-300" /> up next</span>
        </div>
      </div>
    </div>
  );
}
