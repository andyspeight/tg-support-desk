import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { getRequesterTicket } from "@/lib/db/queries";
import { replyAction, rateAction } from "@/app/portal/actions";
import { SubmitButton } from "@/components/portal/submit-button";
import { AutoRefresh } from "@/components/portal/auto-refresh";
import { clientStatus } from "@/lib/portal-status";
import type { StoredAttachment } from "@/lib/channels/attachment-rules";

export default async function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireClient();
  const data = await getRequesterTicket(id, session.email);
  if (!data) notFound();

  const { ticket, messages } = data;
  const s = clientStatus(ticket.status);
  const isClosed = ticket.status === "closed";
  const canRate = ticket.status === "resolved" && !ticket.csat_score;

  return (
    <div className="mx-auto max-w-2xl">
      {!isClosed && <AutoRefresh />}
      <Link href="/portal" className="text-xs text-ink-3 hover:underline">
        ← Your tickets
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{ticket.subject}</h1>
          <p className="text-xs text-ink-3">#{ticket.reference}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.tone}`}>{s.label}</span>
      </div>

      <div className="mt-5 space-y-3">
        {messages.map((m) => {
          const mine = m.role === "customer";
          const atts = ((m.attachments as unknown as StoredAttachment[] | null) ?? [])
            .map((a, i) => ({ a, i }))
            .filter((x) => x.a.stored);
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  mine ? "bg-brand-600 text-white" : "border border-line-soft bg-surface text-ink"
                }`}
              >
                <p className={`mb-1 text-xs font-medium ${mine ? "text-white/70" : "text-ink-3"}`}>
                  {mine ? "You" : "Travelgenix Support"}
                </p>
                <p className="whitespace-pre-wrap">{m.body_text}</p>
                {atts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {atts.map(({ a, i }) => (
                      <a
                        key={i}
                        href={`/api/attachments/${m.id}/${i}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                          mine ? "bg-white/15 text-white hover:bg-white/25" : "border border-line bg-canvas text-ink-2 hover:bg-surface-2"
                        }`}
                      >
                        <Paperclip className="h-3 w-3" strokeWidth={1.75} />
                        {a.filename}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canRate && (
        <form action={rateAction} className="mt-6 rounded-lg border border-line-soft bg-surface p-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <p className="text-sm font-medium">How did we do?</p>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                name="score"
                value={n}
                className="h-9 w-9 rounded-md border border-line text-sm font-medium hover:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/15"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-3">1 = poor · 5 = great</p>
        </form>
      )}
      {ticket.csat_score ? (
        <p className="mt-6 rounded-lg border border-line-soft bg-surface px-4 py-3 text-sm text-ink-2">
          Thanks for rating this {ticket.csat_score}/5.
        </p>
      ) : null}

      {!isClosed ? (
        <form action={replyAction} className="mt-6 space-y-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <textarea
            name="body"
            required
            rows={4}
            maxLength={8000}
            placeholder="Add a reply…"
            className="w-full resize-y rounded-md border border-line bg-surface p-3 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3">
            <input
              type="file"
              name="files"
              multiple
              accept="image/*,.pdf,.txt,.csv,.log"
              className="block w-full text-xs text-ink-3 file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink-2 hover:file:bg-line"
            />
            <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
          </div>
        </form>
      ) : (
        <p className="mt-6 text-center text-xs text-ink-3">This ticket is closed. Raise a new one if you need more help.</p>
      )}
    </div>
  );
}
