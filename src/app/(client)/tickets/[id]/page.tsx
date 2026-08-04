import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LogIn, Paperclip } from "lucide-react";
import { getSession, portalViewFor } from "@/lib/auth";
import { env } from "@/lib/env";
import { bestDisplayName, isEmailish } from "@/lib/names";
import { getPortalTicket } from "@/lib/db/queries";
import { companyForEmail } from "@/lib/portal-company";
import { replyAction, rateAction } from "@/app/(client)/actions";
import { PortalReplyForm } from "@/components/portal/portal-reply-form";
import { AutoRefresh } from "@/components/portal/auto-refresh";
import { clientStatus } from "@/lib/portal-status";
import { LightboxImage } from "@/components/image-lightbox";
import { isImageMime, isVideoMime, type StoredAttachment } from "@/lib/channels/attachment-rules";

function initialsOf(value: string): string {
  return (value.match(/\b\w/g) ?? []).slice(0, 2).join("").toUpperCase() || "Y";
}
/** Avatar letters that never mangle an email ("darrenswan@gmail.com" → "D", not "DG"). */
function avatarInitials(label: string): string {
  return isEmailish(label) ? label.charAt(0).toUpperCase() : initialsOf(label);
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function PortalTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string; from?: string }>;
}) {
  const { id } = await params;
  const { as, from } = await searchParams;
  const session = await getSession();

  // Anonymous visitor. A ticket thread is private to whoever raised it, and we
  // can't authenticate that without a session — so we never render one here.
  // Point them at sign-in; their emailed receipt is the no-account way to follow up.
  if (!session) {
    const signInHref =
      env.portalLoginConfigured || env.ssoBridgeUrl ? `/signin?return=${encodeURIComponent(`/tickets/${id}`)}` : null;
    return (
      <div className="mx-auto max-w-md">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} /> Help centre
        </Link>
        <div className="mt-4 rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-600/10">
            <LogIn className="h-6 w-6 text-brand-600 dark:text-brand-300" strokeWidth={1.5} />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">Sign in to view this ticket</p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-3">
            Ticket conversations are private to the person who raised them. Sign in to see yours — or just reply to the
            confirmation email we sent when you raised it.
          </p>
          {signInHref && (
            <Link
              href={signInHref}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px"
            >
              <LogIn className="h-4 w-4" strokeWidth={1.75} /> Sign in
            </Link>
          )}
        </div>
      </div>
    );
  }

  const view = portalViewFor(session, as);
  // Colleagues at the same client company can open the company's tickets too.
  const company = await companyForEmail(view.email);
  const data = await getPortalTicket(id, view.email, company?.id ?? null);
  if (!data) notFound();

  const { ticket, messages } = data;
  const s = clientStatus(ticket.status);
  const isClosed = ticket.status === "closed";
  const readOnly = view.previewing;
  const isRequester = ticket.requester_email.toLowerCase() === view.email.toLowerCase();
  // The satisfaction rating stays with whoever raised the ticket — it's their
  // experience being scored, not a colleague's.
  const canRate = ticket.status === "resolved" && !ticket.csat_score && !readOnly && isRequester;
  const fromParam = from ? `&from=${encodeURIComponent(from)}` : "";
  const backHref = readOnly ? `/?as=${encodeURIComponent(view.email)}${fromParam}` : "/";
  const deskHref = from ? `/staff/ticket/${from}` : "/staff/inbox";

  return (
    <div className="mx-auto max-w-3xl">
      {!isClosed && <AutoRefresh />}
      <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        {readOnly ? "Their tickets" : "Your tickets"}
      </Link>

      {view.isAgent && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          <span>
            {readOnly ? (
              <>
                <span className="font-medium">Agent preview</span> — viewing as {view.email}. Read-only.
              </>
            ) : (
              <>
                <span className="font-medium">Support desk</span> — you’re viewing the client support portal.
              </>
            )}
          </span>
          <Link
            href={deskHref}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-100"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.75} /> Back to the support desk
          </Link>
        </div>
      )}

      {/* Ticket header */}
      <div className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-[0_16px_36px_-24px_rgba(27,43,91,0.3)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-snug">{ticket.subject}</h1>
            <p className="mt-1 text-xs tabular-nums text-ink-3">
              #{ticket.reference}
              {!isRequester && ` · raised by ${ticket.requester_name || ticket.requester_email}`} · opened{" "}
              {fmtDate(ticket.created_at)}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.tone}`}>{s.label}</span>
        </div>
      </div>

      {/* Conversation */}
      <div className="mt-6 space-y-4">
        {messages.map((m) => {
          const mine = m.role === "customer";
          // Company view: a customer-side message may be a colleague's, not the
          // viewer's — label it with who actually wrote it. Older messages with
          // no author recorded fall back to the ticket's requester.
          const author = (m.author ?? ticket.requester_email).toLowerCase();
          const isViewer = author === view.email.toLowerCase();
          const authorLabel = !mine
            ? "Travelgenix Support"
            : isViewer
              ? "You"
              : author === ticket.requester_email.toLowerCase()
                ? ticket.requester_name || ticket.requester_email
                : author;
          const atts = ((m.attachments as unknown as StoredAttachment[] | null) ?? [])
            .map((a, i) => ({ a, i }))
            .filter((x) => x.a.stored);
          return (
            <div key={m.id} className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  mine ? "bg-surface-2 text-ink-2" : "bg-brand-600 text-white"
                }`}
                aria-hidden
              >
                {mine ? avatarInitials(isViewer ? (bestDisplayName(view.name, view.email) ?? view.email) : authorLabel) : "T"}
              </div>
              <div className="min-w-0 max-w-[82%]">
                <div className={`mb-1 flex items-center gap-2 text-[11px] text-ink-3 ${mine ? "flex-row-reverse" : ""}`}>
                  <span className="max-w-[40vw] truncate font-medium text-ink-2">{authorLabel}</span>
                  <span className="tabular-nums">{fmtTime(m.created_at)}</span>
                </div>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    mine
                      ? "rounded-br-md bg-brand-600 text-white"
                      : "rounded-bl-md border border-line-soft bg-surface text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body_text}</p>
                  {atts.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-start gap-1.5">
                      {atts.map(({ a, i }) => {
                        const src = `/api/attachments/${m.id}/${i}`;
                        if (a.mimeType && isVideoMime(a.mimeType)) {
                          return (
                            <span key={i} className="block overflow-hidden rounded-lg border border-white/20">
                              <video src={src} controls preload="metadata" className="max-h-56 max-w-[220px]" />
                            </span>
                          );
                        }
                        if (a.mimeType && isImageMime(a.mimeType)) {
                          // Screenshots render inline; tap opens a full-size preview in place.
                          return (
                            <LightboxImage
                              key={i}
                              src={src}
                              alt={a.filename}
                              thumbClassName="block overflow-hidden rounded-lg border border-white/20"
                              imgClassName="max-h-56 max-w-[220px] bg-white/10 object-contain"
                            />
                          );
                        }
                        return (
                          <a
                            key={i}
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                              mine
                                ? "bg-white/15 text-white hover:bg-white/25"
                                : "border border-line bg-canvas text-ink-2 hover:bg-surface-2"
                            }`}
                          >
                            <Paperclip className="h-3 w-3" strokeWidth={1.75} />
                            {a.filename}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canRate && (
        <form action={rateAction} className="mt-6 rounded-2xl border border-line bg-surface p-5 text-center shadow-sm">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <p className="text-sm font-medium">How did we do?</p>
          <p className="mt-0.5 text-xs text-ink-3">1 = poor · 5 = great</p>
          <div className="mt-3 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                name="score"
                value={n}
                aria-label={`Rate ${n} out of 5`}
                className="h-10 w-10 rounded-xl border border-line text-sm font-semibold text-ink-2 transition hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700 active:translate-y-px dark:hover:bg-brand-500/15 dark:hover:text-brand-200"
              >
                {n}
              </button>
            ))}
          </div>
        </form>
      )}
      {ticket.csat_score ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface px-4 py-3 text-center text-sm text-ink-2">
          Thanks for rating this {ticket.csat_score}/5.
        </p>
      ) : null}

      {readOnly ? null : !isClosed ? (
        <PortalReplyForm ticketId={ticket.id} reply={replyAction} />
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-line bg-surface px-4 py-5 text-center text-xs text-ink-3">
          This ticket is closed.{" "}
          <Link href="/new" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            Raise a new one
          </Link>{" "}
          if you need more help.
        </p>
      )}
    </div>
  );
}
