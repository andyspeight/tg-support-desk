import Link from "next/link";
import { Star } from "lucide-react";
import type { ClientSupportHistory, TicketStatus } from "@/lib/db/types";

// Customer 360 support-history card — open/recent ticket counts, lifetime CSAT,
// and the client's recent tickets, all from our own data. Sits under the client
// record on the ticket view. The Phase 3 integration-error feed slots in here.

const STATUS_DOT: Record<TicketStatus, string> = {
  new: "bg-blue-500",
  ai_working: "bg-accent-500",
  waiting_on_customer: "bg-amber-500",
  escalated: "bg-red-500",
  resolved: "bg-emerald-500",
  closed: "bg-zinc-400",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "New",
  ai_working: "AI working",
  waiting_on_customer: "Waiting on customer",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function csatTone(avg: number): string {
  if (avg >= 4) return "text-emerald-600 dark:text-emerald-400";
  if (avg >= 3) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-3 text-center">
      <div className="text-lg font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}

export function SupportHistoryPanel({ history }: { history: ClientSupportHistory }) {
  const { total, open, last30Days, csatAvg, csatCount, recent, scope } = history;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="grid grid-cols-3 divide-x divide-line-soft border-b border-line-soft">
        <Stat label="Open" value={open} />
        <Stat label="30 days" value={last30Days} />
        <Stat label="Lifetime" value={total} />
      </div>

      <div className="flex items-center gap-1.5 border-b border-line-soft px-4 py-2.5 text-xs">
        <Star className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.75} />
        {csatAvg !== null ? (
          <span className="text-ink-2">
            <span className={`font-semibold ${csatTone(csatAvg)}`}>{csatAvg.toFixed(1)}</span>
            <span className="text-ink-3">/5</span> · {csatCount} rated
          </span>
        ) : (
          <span className="text-ink-3">No CSAT ratings yet</span>
        )}
      </div>

      <div className="p-2">
        {recent.length === 0 ? (
          <p className="px-2 py-2 text-xs text-ink-3">
            {scope === "client" ? "No other tickets from this client." : "No other tickets from this contact."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {recent.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/ticket/${t.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status]}`}
                    title={STATUS_LABEL[t.status]}
                  />
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-3">#{t.reference}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{t.subject}</span>
                  {t.ai_resolved && (
                    <span className="shrink-0 rounded bg-accent-50 px-1 text-[10px] font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">
                      AI
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-ink-3">{fmtDate(t.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
