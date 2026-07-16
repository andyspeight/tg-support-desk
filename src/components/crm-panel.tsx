import { Star } from "lucide-react";
import type { CrmCareSignal } from "@/lib/integrations/crm-map";

const HEALTH: Record<"green" | "amber" | "red", { label: string; cls: string }> = {
  green: { label: "Healthy", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
  amber: { label: "Watch", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
  red: { label: "At risk", cls: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 truncate text-right text-ink-2">{children}</span>
    </div>
  );
}

/** Customer 360 — care-programme view for this client, read from the B2B CRM. */
export function CrmPanel({ signal }: { signal: CrmCareSignal }) {
  const health = signal.healthFlag ? HEALTH[signal.healthFlag] : null;
  const money = (n: number | null) => (n === null ? "—" : `£${n.toLocaleString("en-GB")}`);

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
          {signal.watchlist && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" strokeWidth={1.5} />}
          <span className="truncate">{signal.companyName}</span>
        </span>
        {health && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${health.cls}`}>{health.label}</span>}
      </div>

      <div className="mt-2 divide-y divide-line-soft">
        {signal.lifecycleStage && <Row label="Stage">{signal.lifecycleStage}</Row>}
        <Row label="MRR">{money(signal.mrr)}</Row>
        <Row label="Renewal">{formatDate(signal.renewalDate)}</Row>
        <Row label="Care cadence">{signal.careCadence ?? "—"}</Row>
        <Row label="Last contact">{formatDate(signal.lastMeaningfulContact)}</Row>
        <Row label="Next care touch">
          {signal.nextCareTouch ? `${signal.nextCareTouch.type ?? "Touch"} · ${formatDate(signal.nextCareTouch.dueDate)}` : "None scheduled"}
        </Row>
      </div>

      {signal.openDeals.length > 0 && (
        <div className="mt-2 border-t border-line-soft pt-2">
          <p className="text-[11px] font-medium text-ink-3">Open deals</p>
          <ul className="mt-1 space-y-1">
            {signal.openDeals.slice(0, 4).map((d, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-ink-2">{d.name}</span>
                <span className="shrink-0 text-ink-3">
                  {d.stage}
                  {d.mrr !== null ? ` · ${money(d.mrr)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {signal.nextBestAction && (
        <p className="mt-2 rounded-md border border-line-soft bg-surface-2 p-2 text-[11px] leading-relaxed text-ink-2">
          <span className="font-medium text-ink-2">Next best action: </span>
          {signal.nextBestAction}
        </p>
      )}

      <p className="mt-2 text-[10px] text-ink-3">From the CRM · matched by {signal.matchedBy === "email" ? "contact email" : "company name"}</p>
    </div>
  );
}
