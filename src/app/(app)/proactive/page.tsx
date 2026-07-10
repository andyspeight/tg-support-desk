import Link from "next/link";
import { Siren } from "lucide-react";
import { listOutreachIncidents } from "@/lib/db/queries";
import type { OutreachIncident } from "@/lib/db/types";
import { NewOutreachForm } from "@/components/new-outreach-form";
import { createOutreachAction } from "./actions";

function recipientCount(recipients: OutreachIncident["recipients"]): number {
  return Array.isArray(recipients) ? recipients.length : 0;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function ProactivePage() {
  const incidents = await listOutreachIncidents();
  const active = incidents.filter((i) => i.status === "open" || i.status === "sending");
  const past = incidents.filter((i) => i.status === "sent" || i.status === "dismissed");

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Siren className="h-5 w-5 text-accent-600 dark:text-accent-300" strokeWidth={1.75} />
        <h1 className="text-lg font-semibold">Proactive outreach</h1>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        Spotted a supplier or integration issue? Give affected clients a heads-up before they raise a ticket. The AI drafts the
        message; you review and send. Each client gets an email and a ticket, so any reply comes straight back into the inbox.
      </p>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">New outreach</h2>
        <NewOutreachForm action={createOutreachAction} />
      </div>

      {active.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Active</h2>
          <ul className="space-y-2">
            {active.map((incident) => {
              const total = recipientCount(incident.recipients);
              const isSending = incident.status === "sending";
              return (
                <li key={incident.id}>
                  <Link
                    href={`/proactive/${incident.id}`}
                    className="block rounded-lg border border-line bg-surface p-3 transition hover:border-ink-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {incident.supplier} — {incident.summary}
                      </span>
                      {isSending ? (
                        <span className="shrink-0 rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                          Sending {incident.sent_count}/{total}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          Draft
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {total} client{total === 1 ? "" : "s"} · raised {formatDate(incident.created_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent</h2>
          <ul className="space-y-2">
            {past.map((incident) => (
              <li key={incident.id}>
                <Link
                  href={`/proactive/${incident.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3 transition hover:border-ink-3"
                >
                  <span className="truncate text-sm text-ink-2">
                    {incident.supplier} — {incident.summary}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">
                    {incident.status === "sent" ? `Sent to ${incident.sent_count}` : "Dismissed"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {incidents.length === 0 && <p className="mt-8 text-center text-sm text-ink-3">No outreach yet.</p>}
    </div>
  );
}
