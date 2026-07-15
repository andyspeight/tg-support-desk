import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import { getOutreachIncident } from "@/lib/db/queries";
import type { OutreachRecipient } from "@/lib/db/types";
import { OutreachComposer } from "@/components/outreach-composer";
import { RefreshPoller } from "@/components/refresh-poller";
import { dismissOutreachAction, redraftOutreachAction, sendOutreachAction } from "../actions";

export default async function OutreachDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = await getOutreachIncident(id);
  if (!incident) notFound();

  const recipients = (Array.isArray(incident.recipients) ? incident.recipients : []) as OutreachRecipient[];
  const sent = incident.status === "sent";
  const sending = incident.status === "sending";
  const dismissed = incident.status === "dismissed";
  const pct = recipients.length > 0 ? Math.round((incident.sent_count / recipients.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/staff/proactive" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Proactive
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{incident.supplier}</h1>
        {sent && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Sent to {incident.sent_count}
          </span>
        )}
        {dismissed && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-3">Dismissed</span>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-2">{incident.summary}</p>
      {incident.detail && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface-2/50 p-3 text-xs text-ink-2">
          {incident.detail}
        </p>
      )}

      <div className="mt-4">
        <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
          <Users className="h-3.5 w-3.5" strokeWidth={1.75} /> Affected clients ({recipients.length})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {recipients.map((recipient) => (
            <span key={recipient.email} className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2">
              {recipient.name ? `${recipient.name} · ` : ""}
              {recipient.email}
            </span>
          ))}
          {recipients.length === 0 && (
            <span className="text-xs text-ink-3">No recipients were parsed — check the list and raise it again.</span>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4 shadow-sm">
        {sending ? (
          <>
            <RefreshPoller intervalMs={5000} />
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Loader2 className="h-4 w-4 animate-spin text-accent-600 motion-reduce:animate-none dark:text-accent-300" strokeWidth={2} />
              Sending in the background…
            </div>
            <p className="mt-1 text-xs text-ink-2">
              {incident.sent_count} of {recipients.length} sent. This keeps going on its own — you can leave this page. Replies
              thread into the inbox.
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <pre className="mt-3 whitespace-pre-wrap border-t border-line-soft pt-3 font-sans text-sm text-ink-2">
              {incident.draft_message}
            </pre>
          </>
        ) : sent ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">
              Message sent to {incident.sent_count} client{incident.sent_count === 1 ? "" : "s"}
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">{incident.draft_message}</pre>
          </>
        ) : dismissed ? (
          <p className="text-sm text-ink-3">This outreach was dismissed.</p>
        ) : (
          <OutreachComposer
            incidentId={incident.id}
            initialDraft={incident.draft_message ?? ""}
            recipientCount={recipients.length}
            redraft={redraftOutreachAction}
            send={sendOutreachAction}
          />
        )}
      </div>

      {incident.status === "open" && (
        <form action={dismissOutreachAction} className="mt-3">
          <input type="hidden" name="incidentId" value={incident.id} />
          <button className="text-xs text-ink-3 transition hover:text-red-600 dark:hover:text-red-400">
            Dismiss this outreach
          </button>
        </form>
      )}
    </div>
  );
}
