import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientSupportHistory, getSurfacedKbForTicket, getTicketSla, getTicketWithMessages, listCannedResponses, listPublishedKbForPicker, searchPastTickets } from "@/lib/db/queries";
import { kbBestUrl } from "@/lib/kb-links";
import { getSession } from "@/lib/auth";
import type { ClockState } from "@/lib/sla";
import { getClientById, listAllClientCompanies } from "@/lib/integrations/airtable-clients";
import { env } from "@/lib/env";
import { allowPatternFor, sanitizeEmailHtml } from "@/lib/channels/email-parse";
import type { Message } from "@/lib/db/types";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, GitMerge, LayoutDashboard, Lightbulb, Loader2, Paperclip, Users } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { RefreshPoller } from "@/components/refresh-poller";
import { ReplyBox } from "@/components/reply-box";
import { ClientPanel } from "@/components/client-panel";
import { SupportHistoryPanel } from "@/components/support-history-panel";
import { RelevantKbPanel } from "@/components/relevant-kb-panel";
import { RunAiButton } from "@/components/run-ai-button";
import { TicketPresence } from "@/components/ticket-presence";
import { addNoteAction, approveSenderAction, blockSenderAction, detachRequesterAction, linkRequesterAction, mergeTicketAction, presenceHeartbeatAction, runAiAction, sendReplyAction, snoozeTicketAction, unmergeTicketAction, updateTicketAction, watchTicketAction } from "../actions";
import {
  copilotDraftAction,
  copilotRephraseAction,
  copilotReviewAction,
  copilotSummariseAction,
  copilotTranslateAction,
} from "../copilot-actions";

const ROLE_STYLES: Record<Message["role"], { label: string; className: string }> = {
  customer: { label: "Customer", className: "border-line bg-surface" },
  ai: { label: "AI", className: "border-accent-200 bg-accent-50 dark:border-accent-500/25 dark:bg-accent-500/10" },
  human: { label: "Agent", className: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" },
  internal_note: { label: "Internal note", className: "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" },
  system: { label: "System", className: "border-line bg-surface-2" },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

type MessageAttachment = {
  filename: string;
  size: number;
  stored: boolean;
  rejected?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const CLOCK_LABEL: Record<ClockState, { text: string; cls: string }> = {
  met: { text: "met", cls: "text-emerald-600 dark:text-emerald-400" },
  late: { text: "met late", cls: "text-amber-600 dark:text-amber-400" },
  pending: { text: "due", cls: "text-ink-2" },
  breached: { text: "breached", cls: "font-semibold text-red-600 dark:text-red-400" },
};

function MessageAttachments({ messageId, attachments }: { messageId: string; attachments: unknown }) {
  const list = (Array.isArray(attachments) ? attachments : []) as MessageAttachment[];
  if (list.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2 border-t border-black/5 pt-2 dark:border-white/10">
      {list.map((a, i) =>
        a.stored ? (
          <a
            key={i}
            href={`/api/attachments/${messageId}/${i}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink hover:border-ink-3"
          >
            <Paperclip className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="max-w-[200px] truncate">{a.filename}</span>
            <span className="text-ink-3">{formatBytes(a.size)}</span>
          </a>
        ) : (
          <span
            key={i}
            title={a.rejected}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-2 py-1 text-xs text-ink-3"
          >
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="max-w-[200px] truncate line-through">{a.filename}</span>
            <span>blocked</span>
          </span>
        ),
      )}
    </div>
  );
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await getTicketWithMessages(id).catch(() => null);
  if (!loaded) notFound();
  const { ticket, messages } = loaded;

  const session = await getSession();
  const watching = !!session && ticket.watchers.some((w) => w.toLowerCase() === session.email.toLowerCase());
  const cannedVars = {
    first_name: ticket.requester_name?.split(/\s+/)[0] ?? "",
    name: ticket.requester_name ?? "",
    agent: session?.name ?? session?.email ?? "",
    ticket: `#${ticket.reference}`,
  };

  const latestCustomer = [...messages].reverse().find((m) => m.role === "customer");
  const pastQuery = (latestCustomer?.body_text || ticket.subject).slice(0, 500);

  const [canned, clientRecord, sla, supportHistory, pastTickets, kbPickerRaw, surfacedKb, companies] = await Promise.all([
    listCannedResponses().catch(() => []),
    ticket.client_id ? getClientById(ticket.client_id) : Promise.resolve(null),
    getTicketSla(ticket).catch(() => null),
    getClientSupportHistory({
      clientId: ticket.client_id,
      requesterEmail: ticket.requester_email,
      excludeTicketId: ticket.id,
    }).catch(() => null),
    searchPastTickets(pastQuery, ticket.client_id, 4).catch(() => []),
    listPublishedKbForPicker().catch(() => []),
    getSurfacedKbForTicket(ticket.id).catch(() => []),
    // Company picker for the link-requester control — only needed when unmatched.
    ticket.client_id ? Promise.resolve([]) : listAllClientCompanies().catch(() => []),
  ]);
  // "How we solved this before" — similar resolved tickets, current one excluded.
  const solvedBefore = pastTickets.filter((p) => p.ticket_id !== ticket.id).slice(0, 3);

  // KB referencing: every published article is available to link from the reply
  // box; the ones the AI already surfaced on this ticket are suggested up front.
  const kbArticles = kbPickerRaw.map((a) => ({ id: a.id, title: a.title, url: kbBestUrl(env.appBaseUrl, a) }));
  const relevantKb = surfacedKb.map((a) => ({ id: a.id, title: a.title, url: kbBestUrl(env.appBaseUrl, a) }));

  const handover = [...messages]
    .reverse()
    .find((m) => m.role === "internal_note" && (m.channel_meta as { kind?: string })?.kind === "handover");

  // The AI's shadow-mode draft, if one is still waiting for a human to send it
  // (no reply has gone out since). Surfaced into the composer so an agent can
  // accept it, edit, and send — not just read it. The team sign-off is trimmed
  // (the agent's own sign-off is added on send).
  let aiDraft: string | null = null;
  let aiDraftKind: string | null = null;
  if (ticket.status !== "resolved" && ticket.status !== "closed") {
    let shadowIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "internal_note" && (m.channel_meta as { kind?: string })?.kind === "shadow_draft") {
        shadowIdx = i;
        break;
      }
    }
    if (shadowIdx >= 0 && !messages.slice(shadowIdx + 1).some((m) => m.role === "human" || m.role === "ai")) {
      const meta = messages[shadowIdx].channel_meta as { draft_text?: string; would_be?: string };
      const sendable = meta.would_be === "answered" || meta.would_be === "clarified";
      const body = messages[shadowIdx].body_text;
      const raw = meta.draft_text ?? (sendable ? body.slice(body.indexOf("\n\n") + 2) : null);
      if (raw) {
        aiDraft = raw.replace(/\n*\s*travelgenix support\s*$/i, "").trim() || null;
        if (aiDraft) aiDraftKind = meta.would_be ?? null;
      }
    }
  }

  // A definitive AI answer should close on send (a reply reopens + re-runs it);
  // a clarifying question waits on the customer. This just sets the composer's
  // default — the agent can still override via the "then →" dropdown.
  const composerAfterStatus = aiDraftKind === "answered" ? "closed" : "waiting_on_customer";

  // Customer shortcuts: all of this client's tickets (agent view), and the
  // client's own support portal as they see it (agent read-only preview).
  const clientTicketsHref = `/staff/clients?${new URLSearchParams({
    ...(ticket.client_id ? { client: ticket.client_id } : {}),
    email: ticket.requester_email,
  }).toString()}`;
  const clientPortalHref = `/?as=${encodeURIComponent(ticket.requester_email)}&from=${ticket.id}`;

  // Lifecycle quick-actions (Zendesk-style): resolve/close/reopen by current state.
  const lifecycleOpen = ["new", "ai_working", "waiting_on_customer", "escalated", "needs_review", "pending"].includes(ticket.status);
  const lifecycleResolved = ticket.status === "resolved";
  const lifecycleClosed = ticket.status === "closed";

  return (
    <div className="flex flex-col lg:h-full">
      <TicketPresence ticketId={ticket.id} heartbeat={presenceHeartbeatAction} />
      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <RefreshPoller intervalMs={ticket.status === "ai_working" ? 6000 : 20000} />

      {/* Conversation column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line bg-surface px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/staff/inbox" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Inbox
            </Link>
            <span className="text-sm text-ink-3">#{ticket.reference}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <form action={updateTicketAction} className="ml-auto flex items-center gap-1.5">
              <input type="hidden" name="ticketId" value={ticket.id} />
              {lifecycleOpen && (
                <button
                  name="status"
                  value="resolved"
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 active:translate-y-px"
                >
                  Resolve
                </button>
              )}
              {!lifecycleClosed && (
                <button
                  name="status"
                  value="closed"
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink active:translate-y-px"
                >
                  Close
                </button>
              )}
              {(lifecycleResolved || lifecycleClosed) && (
                <button
                  name="status"
                  value="new"
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink active:translate-y-px"
                >
                  Reopen
                </button>
              )}
            </form>
          </div>
          <h1 className="mt-1 truncate text-base font-semibold">{ticket.subject}</h1>
          <p className="text-xs text-ink-2">
            {ticket.requester_name ? `${ticket.requester_name} · ` : ""}
            {ticket.requester_email} · opened {formatDateTime(ticket.created_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={clientTicketsHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Users className="h-3.5 w-3.5" strokeWidth={1.75} /> All client tickets
            </Link>
            <Link
              href={clientPortalHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <LayoutDashboard className="h-3.5 w-3.5" strokeWidth={1.75} /> Client&apos;s dashboard
            </Link>
          </div>
        </div>

        <div className="flex-1 space-y-3 px-4 py-4 sm:px-6 lg:overflow-y-auto">
          {ticket.status === "ai_working" && (
            <div className="flex items-start gap-3 rounded-lg border border-accent-200 bg-accent-50 p-4 dark:border-accent-500/25 dark:bg-accent-500/10">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-accent-600 motion-reduce:animate-none dark:text-accent-300" strokeWidth={2} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">
                  AI is working on this
                </p>
                <p className="mt-1.5 text-sm text-ink-2">
                  Reading the ticket and drafting a reply — usually under a minute. It’ll either send its answer or leave a
                  draft here for you to review. This updates on its own.
                </p>
              </div>
            </div>
          )}

          {ticket.status === "needs_review" && aiDraft && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-500/25 dark:bg-orange-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                AI reply drafted — review &amp; send
              </p>
              <p className="mt-1.5 text-sm text-ink-2">
                The AI wrote a reply but wasn’t cleared to send it on its own. Hit{" "}
                <span className="font-medium text-ink">Use AI draft</span> in the reply box to load it, edit anything you
                like, and send — your edits teach it to get the next one right.
              </p>
            </div>
          )}

          {ticket.status === "awaiting_approval" && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/25 dark:bg-violet-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Pending approval — unknown sender
              </p>
              <p className="mt-1.5 text-sm text-ink-2">
                <span className="font-medium text-ink">{ticket.requester_email}</span> isn’t on the allow-list and
                isn’t matched to a client, so the AI hasn’t replied and no acknowledgement has gone out. Approve to add
                them to the allow-list and let the AI take it from here, or block them as spam.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={approveSenderAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <button className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 active:translate-y-px">
                    Approve sender &amp; respond
                  </button>
                </form>
                <form action={blockSenderAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <button className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 active:translate-y-px dark:hover:bg-red-500/10 dark:hover:text-red-300">
                    Block as spam
                  </button>
                </form>
              </div>
              <p className="mt-2 text-xs text-ink-3">
                Approving allow-lists <span className="font-mono">{allowPatternFor(ticket.requester_email)}</span>; blocking
                drops future email from this exact address.
              </p>
            </div>
          )}

          {ticket.status === "escalated" && handover && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/25 dark:bg-red-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">AI handover</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">{handover.body_text}</pre>
            </div>
          )}

          {messages.map((message) => {
            const mergeMeta =
              message.role === "internal_note"
                ? (message.channel_meta as { kind?: string; direction?: string; undone?: boolean } | null)
                : null;
            if (mergeMeta?.kind === "merge") {
              const canUnmerge = mergeMeta.direction === "in" && !mergeMeta.undone;
              return (
                <div
                  key={message.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <GitMerge className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
                    <span className="truncate">{message.body_text}</span>
                    <span className="shrink-0 text-ink-3">· {formatDateTime(message.created_at)}</span>
                  </span>
                  {canUnmerge && (
                    <form action={unmergeTicketAction} className="shrink-0">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <input type="hidden" name="noteId" value={message.id} />
                      <button className="rounded-md border border-line bg-surface px-2 py-1 font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                        Unmerge
                      </button>
                    </form>
                  )}
                </div>
              );
            }
            const style = ROLE_STYLES[message.role];
            return (
              <div key={message.id} className={`rounded-lg border p-3 ${style.className}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">
                    {style.label}
                    {message.author && message.author !== "resolution-agent" ? ` · ${message.author}` : ""}
                  </span>
                  <span className="text-xs text-ink-3">{formatDateTime(message.created_at)}</span>
                </div>
                {message.body_html ? (
                  <div
                    className="tg-prose mt-1.5 text-sm text-ink"
                    dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(message.body_html) }}
                  />
                ) : (
                  <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm text-ink">{message.body_text}</pre>
                )}
                <MessageAttachments messageId={message.id} attachments={message.attachments} />
              </div>
            );
          })}
        </div>

        <div className="border-t border-line bg-surface-2 p-3 sm:p-4">
          <ReplyBox
            ticketId={ticket.id}
            canned={canned}
            kbArticles={kbArticles}
            vars={cannedVars}
            aiDraft={aiDraft}
            defaultAfterStatus={composerAfterStatus}
            sendReply={sendReplyAction}
            addNote={addNoteAction}
            copilot={{
              draft: copilotDraftAction,
              summarise: copilotSummariseAction,
              rephrase: copilotRephraseAction,
              translate: copilotTranslateAction,
              review: copilotReviewAction,
            }}
          />
        </div>
      </div>

      {/* Controls column — Customer 360 (client record + support history) up top */}
      <aside className="w-full shrink-0 space-y-5 border-t border-line bg-surface-2/40 p-4 sm:p-5 lg:w-[27rem] lg:border-l lg:border-t-0 lg:overflow-y-auto">
        <form action={runAiAction}>
          <input type="hidden" name="ticketId" value={ticket.id} />
          <RunAiButton />
        </form>

        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Customer</h2>
          {clientRecord ? (
            <>
              <ClientPanel record={clientRecord} />
              {/* The ex-employee case: cut this address off from the company view.
                  History stays on the company's record. */}
              <form action={detachRequesterAction} className="mt-1.5 text-right">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <button className="text-[11px] text-ink-3 underline-offset-2 hover:text-red-600 hover:underline dark:hover:text-red-400">
                  Stop {ticket.requester_email} seeing this company’s tickets
                </button>
              </form>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-surface p-3">
              <p className="text-xs text-ink-3">
                {ticket.client_id ? "Client record unavailable." : "No client record matched."}
              </p>
              {!ticket.client_id && companies.length > 0 && (
                <>
                  <form action={linkRequesterAction} className="mt-2 flex gap-1.5">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <select
                      name="clientId"
                      required
                      defaultValue=""
                      className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink-2 focus:border-ink-3 focus:outline-none"
                      aria-label="Link requester to a company"
                    >
                      <option value="" disabled>
                        Choose a company…
                      </option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
                      Link
                    </button>
                  </form>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                    Links {ticket.requester_email} to the company — this ticket and their past ones join its history,
                    and they’ll see the company’s tickets in the portal.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {supportHistory && (
          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Support history</h2>
            <SupportHistoryPanel history={supportHistory} />
          </div>
        )}

        {solvedBefore.length > 0 && (
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.75} /> How we solved this before
            </h2>
            <ul className="space-y-2">
              {solvedBefore.map((p) => (
                <li key={p.ticket_id}>
                  <Link
                    href={`/staff/ticket/${p.ticket_id}`}
                    className="block rounded-lg border border-line bg-surface p-3 transition hover:border-ink-3"
                  >
                    <p className="truncate text-xs font-medium text-ink">{p.subject}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-3">{p.snippet}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <RelevantKbPanel articles={relevantKb} />

        <form action={updateTicketAction} className="space-y-3 text-sm">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
            <label className="text-xs font-medium text-ink-2">Status</label>
            <select name="status" defaultValue={ticket.status} className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="new">New</option>
              <option value="ai_working">AI working</option>
              <option value="waiting_on_customer">Waiting on customer</option>
              <option value="pending">Pending</option>
              <option value="escalated">Escalated</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2">Priority</label>
            <select name="priority" defaultValue={ticket.priority} className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="p1">P1 — Urgent</option>
              <option value="p2">P2 — Standard</option>
              <option value="p3">P3 — Low</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2">Assignee</label>
            <select name="assignee" defaultValue={ticket.assignee ?? ""} className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="">Unassigned</option>
              {env.agentEmails.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2">Tags (comma-separated)</label>
            <input
              name="tags"
              defaultValue={ticket.tags.join(", ")}
              className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5"
            />
          </div>
          <button className="w-full rounded-md border border-line bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-2">
            Update ticket
          </button>
        </form>

        {/* Watch + snooze */}
        <div className="space-y-2 border-t border-line-soft pt-3 text-sm">
          <form action={watchTicketAction}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-ink-2 hover:bg-surface-2">
              {watching ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> Stop watching
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" strokeWidth={1.75} /> Watch this ticket
                </>
              )}
            </button>
          </form>
          {ticket.watchers.length > 0 && (
            <p className="text-[11px] text-ink-3">Watching: {ticket.watchers.join(", ")}</p>
          )}

          <form action={snoozeTicketAction} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <span className="mr-1 text-xs text-ink-2">Snooze</span>
            {(["1h", "3h", "tomorrow", "3d"] as const).map((u) => (
              <button
                key={u}
                name="until"
                value={u}
                className="rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-2 hover:bg-surface-2"
              >
                {u}
              </button>
            ))}
          </form>
          {ticket.snoozed_until && (
            <form action={snoozeTicketAction} className="flex items-center justify-between text-[11px] text-amber-700 dark:text-amber-400">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <span>Snoozed until {formatDateTime(ticket.snoozed_until)}</span>
              <button name="until" value="clear" className="underline hover:no-underline">
                clear
              </button>
            </form>
          )}
        </div>

        {ticket.escalation_reason && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
            <span className="font-semibold">Escalation:</span> {ticket.escalation_reason}
          </div>
        )}

        <form action={mergeTicketAction} className="border-t border-line-soft pt-3">
          <label className="text-xs font-medium text-ink-2">Merge into ticket #</label>
          <div className="mt-1 flex gap-2">
            <input
              name="targetRef"
              inputMode="numeric"
              placeholder="ref"
              className="w-20 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
            />
            <input type="hidden" name="ticketId" value={ticket.id} />
            <button className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">
              Merge
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-3">Moves this conversation into the target and closes this one.</p>
        </form>

        {sla && (
          <div className="rounded-md border border-line-soft bg-surface-2 p-2 text-xs text-ink-2">
            <p className="font-medium text-ink-2">SLA</p>
            <p className="mt-1">
              First response{" "}
              <span className={CLOCK_LABEL[sla.firstResponse.state].cls}>{CLOCK_LABEL[sla.firstResponse.state].text}</span>{" "}
              · {formatDateTime(new Date(sla.firstResponse.dueMs).toISOString())}
            </p>
            <p>
              Resolve <span className={CLOCK_LABEL[sla.resolve.state].cls}>{CLOCK_LABEL[sla.resolve.state].text}</span> ·{" "}
              {formatDateTime(new Date(sla.resolve.dueMs).toISOString())}
            </p>
          </div>
        )}

        <div className="text-xs text-ink-3">
          <p>Intent: {ticket.intent ?? "—"}</p>
          <p>Language: {ticket.language ?? "—"}</p>
          <p>AI resolved: {ticket.ai_resolved ? "yes" : "no"}</p>
          <p>First response: {ticket.first_response_at ? formatDateTime(ticket.first_response_at) : "—"}</p>
          {ticket.cc_emails.length > 0 && <p>CC: {ticket.cc_emails.join(", ")}</p>}
        </div>
      </aside>
      </div>
    </div>
  );
}
