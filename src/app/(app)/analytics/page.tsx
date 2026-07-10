import { getAnalytics } from "@/lib/db/analytics";
import { qaSummary } from "@/lib/db/queries";
import { getClientById } from "@/lib/integrations/airtable-clients";
import { RESOLUTION_MILESTONES } from "@/lib/roadmap";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

function Bar({ value, max, className = "bg-accent-500" }: { value: number; max: number; className?: string }) {
  return (
    <span className="block h-1.5 w-full rounded-full bg-surface-2">
      <span className={`block h-1.5 rounded-full ${className}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </span>
  );
}

export default async function AnalyticsPage() {
  const a = await getAnalytics();
  const target = 70;
  const qa = await qaSummary().catch(() => ({ total: 0, flagged: 0 }));
  const qaPassRate = qa.total > 0 ? Math.round(((qa.total - qa.flagged) / qa.total) * 100) : null;

  // Resolve the top-client rec ids to company names (agent-only page; falls
  // back to the id per-item so a slow/missing Airtable never breaks the page).
  const clientNames = new Map<string, string>();
  await Promise.all(
    a.topClients.map(async (c) => {
      try {
        const rec = await getClientById(c.clientId);
        const name = rec?.fields?.["ClientName"] ?? rec?.fields?.["Trading Name"];
        if (name) clientNames.set(c.clientId, String(name));
      } catch {
        // keep the rec id
      }
    }),
  );

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <p className="mt-1 text-sm text-ink-2">
        True AI resolution = resolved with no human reply, not reopened, CSAT not negative.
      </p>

      {!a.connected && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          No data yet — metrics populate once tickets start flowing (Stage 1 go-live).
        </div>
      )}

      {/* Headline: AI resolution rate vs the 70% target */}
      <div className="mt-5 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">True AI resolution rate</h2>
          <span className="text-xs text-ink-3">target {target}%</span>
        </div>
        <p className="mt-2 text-4xl font-semibold text-accent-700 dark:text-accent-300">
          {a.aiResolutionRateStrict === null ? "—" : `${a.aiResolutionRateStrict}%`}
        </p>
        <div className="relative mt-4 h-3 rounded-full bg-surface-2">
          <div
            className="absolute h-3 rounded-full bg-accent-500"
            style={{ width: `${Math.min(a.aiResolutionRateStrict ?? 0, 100)}%` }}
          />
          {RESOLUTION_MILESTONES.map((m) => (
            <div key={m.pct} className="absolute -top-1" style={{ left: `${m.pct}%` }}>
              <div className={`h-5 w-0.5 ${(a.aiResolutionRateStrict ?? 0) >= m.pct ? "bg-emerald-500" : "bg-ink-3"}`} />
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-ink-3">
          {a.totals.aiResolved} AI-resolved of {a.totals.resolved} resolved
          {a.aiResolutionRate !== null && a.aiResolutionRate !== a.aiResolutionRateStrict
            ? ` · ${a.aiResolutionRate}% before excluding negative CSAT`
            : ""}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tickets" value={String(a.totals.tickets)} />
        <Stat label="Resolved" value={String(a.totals.resolved)} />
        <Stat label="Escalated (open)" value={String(a.totals.escalated)} />
        <Stat
          label="SLA compliance"
          value={a.sla ? `${a.sla.metPct}%` : "—"}
          sub={a.sla ? `${a.sla.measured} measured` : undefined}
        />
        <Stat
          label="First response"
          value={a.firstResponseMins ? `${a.firstResponseMins.median}m` : "—"}
          sub={a.firstResponseMins ? `avg ${a.firstResponseMins.avg}m` : undefined}
        />
        <Stat
          label="Full resolution"
          value={a.resolutionHours ? `${a.resolutionHours.median}h` : "—"}
          sub={a.resolutionHours ? `avg ${a.resolutionHours.avg}h` : undefined}
        />
        <Stat
          label="CSAT (AI)"
          value={a.csat?.aiAvg != null ? `${a.csat.aiAvg}/5` : "—"}
          sub={a.csat?.humanAvg != null ? `human ${a.csat.humanAvg}/5` : a.csat ? `${a.csat.count} rated` : undefined}
        />
        <Stat label="CSAT responses" value={a.csat ? String(a.csat.count) : "—"} />
        <Stat
          label="AI QA pass rate"
          value={qaPassRate === null ? "—" : `${qaPassRate}%`}
          sub={qa.total > 0 ? `${qa.total} AI replies checked` : "auto-sent replies, judged"}
        />
        <Stat
          label="QA flags"
          value={String(qa.flagged)}
          sub={qa.flagged > 0 ? "sent replies needing a look" : "none flagged"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Resolution by intent */}
        <section>
          <h2 className="text-sm font-semibold">Resolution by intent</h2>
          <div className="mt-2 space-y-2">
            {a.byIntent.length === 0 && <p className="text-sm text-ink-3">No resolved tickets yet.</p>}
            {a.byIntent.map((row) => (
              <div key={row.intent} className="text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-ink">{row.intent}</span>
                  <span className="text-xs text-ink-3">
                    {row.rate}% AI · {row.total}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={row.rate} max={100} className={row.rate >= target ? "bg-emerald-500" : "bg-accent-500"} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Escalation reasons */}
        <section>
          <h2 className="text-sm font-semibold">Top escalation reasons</h2>
          <div className="mt-2 space-y-2">
            {a.escalationReasons.length === 0 && <p className="text-sm text-ink-3">No escalations yet.</p>}
            {a.escalationReasons.map((row) => {
              const max = a.escalationReasons[0]?.count ?? 1;
              return (
                <div key={row.reason} className="text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink">{row.reason}</span>
                    <span className="text-xs text-ink-3">{row.count}</span>
                  </div>
                  <div className="mt-1">
                    <Bar value={row.count} max={max} className="bg-amber-500" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Volume by client */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold">Ticket volume by client (top 10)</h2>
        <p className="text-xs text-ink-3">Feeds the CRM care conversation. Names resolve via the 360 panel.</p>
        <div className="mt-2 space-y-1">
          {a.topClients.length === 0 && <p className="text-sm text-ink-3">No client-matched tickets yet.</p>}
          {a.topClients.map((c) => {
            const name = clientNames.get(c.clientId);
            return (
              <div key={c.clientId} className="flex items-center justify-between gap-3 rounded-md border border-line-soft bg-surface px-3 py-1.5 text-sm">
                {name ? (
                  <span className="min-w-0 truncate text-ink">{name}</span>
                ) : (
                  <span className="min-w-0 truncate font-mono text-xs text-ink-2">{c.clientId}</span>
                )}
                <span className="shrink-0 text-ink">{c.count}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
