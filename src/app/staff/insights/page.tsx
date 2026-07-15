import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Plug, TrendingUp, UserRound, Users } from "lucide-react";
import { getTrendSnapshot } from "@/lib/db/queries";
import { EMPTY_SNAPSHOT, type ClientWatch, type TrendTicketRef } from "@/lib/insights/types";
import { refreshInsightsAction } from "./actions";
import { RefreshInsightsButton } from "@/components/refresh-insights-button";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

const FLAG_LABEL: Record<string, string> = {
  "high-volume": "high volume",
  rising: "rising",
  escalations: "escalations",
  "negative-csat": "negative CSAT",
  reopens: "reopens",
};

function FlagChip({ flag }: { flag: string }) {
  const danger = flag === "negative-csat" || flag === "reopens" || flag === "escalations";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        danger
          ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      }`}
    >
      {FLAG_LABEL[flag] ?? flag}
    </span>
  );
}

function TicketChips({ tickets }: { tickets: TrendTicketRef[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tickets.map((t) => (
        <Link
          key={t.id}
          href={`/staff/ticket/${t.id}`}
          title={t.subject}
          className="inline-flex max-w-[240px] items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2 hover:border-ink-3 hover:text-ink"
        >
          <span className="text-ink-3">#{t.reference}</span>
          <span className="truncate">{t.clientName ?? t.subject}</span>
        </Link>
      ))}
    </div>
  );
}

function clientLabel(c: ClientWatch): string {
  return c.clientName ?? c.clientId;
}

export default async function InsightsPage() {
  const loaded = await getTrendSnapshot().catch(() => null);
  const snap = loaded?.payload ?? EMPTY_SNAPSHOT;
  const computedAt = loaded && snap.computed ? snap.computedAt : null;

  const corrByCluster = new Map<string, typeof snap.supplierCorrelations>();
  for (const corr of snap.supplierCorrelations) {
    const list = corrByCluster.get(corr.clusterKey) ?? [];
    list.push(corr);
    corrByCluster.set(corr.clusterKey, list);
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Insights</h1>
        <form action={refreshInsightsAction}>
          <RefreshInsightsButton />
        </form>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        Recurring problems and clients worth a closer look — refreshed hourly.{" "}
        {computedAt ? <span className="text-ink-3">Updated {formatDateTime(computedAt)}.</span> : null}
      </p>

      {!computedAt && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          No snapshot yet — it computes on the hour, or hit <span className="font-medium">Refresh now</span>.
        </div>
      )}

      {/* ── Trending issues ─────────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-ink-3" strokeWidth={1.75} /> Trending issues
          <span className="font-normal text-ink-3">· {snap.windowDays} days · {snap.ticketsAnalysed} tickets</span>
        </h2>
        {snap.clusters.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">
            No issue with 3+ tickets in the last {snap.windowDays} days. That&apos;s good news.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {snap.clusters.map((c) => (
              <div key={c.key} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {c.label}
                    {c.emerging && (
                      <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                        new
                      </span>
                    )}
                  </h3>
                  <span className="text-xs font-medium text-ink-2">
                    {c.count} ticket{c.count === 1 ? "" : "s"}
                  </span>
                </div>
                {c.description && <p className="mt-0.5 text-xs text-ink-2">{c.description}</p>}
                {(corrByCluster.get(c.key) ?? []).map((corr, i) => (
                  <p key={i} className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    <Plug className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                    Lines up with {corr.supplier}: {corr.summary} ({corr.overlapCount} of these tickets)
                  </p>
                ))}
                <TicketChips tickets={c.tickets} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Clients to watch ────────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="h-4 w-4 text-ink-3" strokeWidth={1.75} /> Clients to watch
          <span className="font-normal text-ink-3">· last 30 days</span>
        </h2>
        {snap.clientsToWatch.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No clients standing out yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-1.5 pr-3 font-medium">Client</th>
                  <th className="px-2 py-1.5 text-right font-medium">30d</th>
                  <th className="px-2 py-1.5 text-right font-medium">vs prior</th>
                  <th className="px-2 py-1.5 text-right font-medium">Escal.</th>
                  <th className="px-2 py-1.5 text-right font-medium">Reopen</th>
                  <th className="px-2 py-1.5 text-right font-medium">CSAT</th>
                  <th className="px-2 py-1.5 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {snap.clientsToWatch.map((c) => (
                  <tr key={c.clientId} className="border-b border-line-soft">
                    <td className="max-w-[220px] truncate py-1.5 pr-3 text-ink">{clientLabel(c)}</td>
                    <td className="px-2 py-1.5 text-right font-medium text-ink">{c.count30}</td>
                    <td className="px-2 py-1.5 text-right">
                      {c.deltaPct === null ? (
                        <span className="text-ink-3">new</span>
                      ) : (
                        <span
                          className={`inline-flex items-center ${
                            c.deltaPct > 0 ? "text-red-600 dark:text-red-400" : c.deltaPct < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-ink-3"
                          }`}
                        >
                          {c.deltaPct > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : c.deltaPct < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                          {Math.abs(c.deltaPct)}%
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{c.escalations || "—"}</td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{c.reopens || "—"}</td>
                    <td className="px-2 py-1.5 text-right text-ink-2">{c.csatAvg == null ? "—" : `${c.csatAvg}`}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex flex-wrap gap-1">
                        {c.flags.map((f) => (
                          <FlagChip key={f} flag={f} />
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Negative-experience trend ───────────────────────────────────────── */}
      {snap.negativeSpikes.map((s, i) => (
        <div
          key={i}
          className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            Negative experience is rising — {s.negativeCsat} negative rating{s.negativeCsat === 1 ? "" : "s"} and {s.reopens} reopen
            {s.reopens === 1 ? "" : "s"} in the last {s.windowDays} days, up on the week before. Worth a look at what&apos;s going out.
          </span>
        </div>
      ))}

      {/* ── Repeat contacts ─────────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <UserRound className="h-4 w-4 text-ink-3" strokeWidth={1.75} /> Repeat contacts
          <span className="font-normal text-ink-3">· 7 days</span>
        </h2>
        {snap.repeatContacts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">Nobody has opened 3+ tickets this week.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {snap.repeatContacts.map((r) => (
              <div key={r.email} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {r.name ?? r.email}
                    {r.clientName && <span className="ml-1.5 font-normal text-ink-3">· {r.clientName}</span>}
                  </span>
                  <span className="text-xs font-medium text-ink-2">{r.count} tickets</span>
                </div>
                <TicketChips tickets={r.tickets} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
