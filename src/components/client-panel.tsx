import { ExternalLink } from "lucide-react";
import type { ClientRecordLike } from "@/lib/integrations/client-summary";

// Customer 360 card — the right-hand centrepiece on a ticket. Renders the safe,
// allowlisted client fields from Airtable as a structured card. It only reads
// known-safe fields; credential filtering lives in client-summary.ts.

const DETAIL_FIELDS: [label: string, field: string][] = [
  ["Travelify App ID", "Travelify App ID"],
  ["Travelify Site ID", "Travelify Site ID"],
  ["App name", "App Name"],
  ["Primary contact", "Primary Contact Name"],
  ["Go-live", "Go-Live Date"],
  ["Setup date", "Setup Date"],
];

function val(fields: Record<string, unknown>, key: string): string | null {
  const v = fields[key];
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

export function ClientPanel({ record }: { record: ClientRecordLike }) {
  const f = record.fields;
  const name = val(f, "ClientName") ?? "Client";
  const trading = val(f, "Trading Name");
  const plan = val(f, "Plan");
  const status = val(f, "Status");
  const website = val(f, "Website URL");
  const monogram = name.trim().charAt(0).toUpperCase() || "?";
  const active = status?.toLowerCase() === "active";
  const details = DETAIL_FIELDS.map(([label, key]) => [label, val(f, key)] as const).filter(
    (row): row is readonly [string, string] => row[1] !== null,
  );

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-line-soft bg-gradient-to-b from-surface-2 to-surface p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-semibold text-white dark:bg-brand-500">
          {monogram}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{name}</h3>
          {trading && trading !== name && <p className="truncate text-xs text-ink-2">{trading}</p>}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {(plan || status) && (
          <div className="flex flex-wrap gap-1.5">
            {plan && (
              <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-medium text-accent-700 ring-1 ring-inset ring-accent-200 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/25">
                {plan}
              </span>
            )}
            {status && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  active
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25"
                    : "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-500/25"
                }`}
              >
                {status}
              </span>
            )}
          </div>
        )}

        {details.length > 0 && (
          <dl className="space-y-2">
            {details.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs text-ink-3">{label}</dt>
                <dd className="truncate text-right text-xs font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200"
          >
            {website.replace(/^https?:\/\//, "").replace(/\/+$/, "")}
            <ExternalLink className="ml-1 inline h-3.5 w-3.5" strokeWidth={1.75} />
          </a>
        )}
      </div>
    </section>
  );
}
