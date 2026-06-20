import Link from "next/link";
import { notFound } from "next/navigation";
import { getTicketSla, getTicketWithMessages, listCannedResponses } from "@/lib/db/queries";
import { getSession } from "@/lib/auth";
import type { ClockState } from "@/lib/sla";
import { getClientById } from "@/lib/integrations/airtable-clients";
import { env } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/channels/email-parse";
import type { Message } from "@/lib/db/types";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Paperclip } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { RefreshPoller } from "@/components/refresh-poller";
import { ReplyBox } from "@/components/reply-box";
import { ClientPanel } from "@/components/client-panel";
import { RunAiButton } from "@/components/run-ai-button";
import { addNoteAction, mergeTicketAction, runAiAction, sendReplyAction, snoozeTicketAction, updateTicketAction, watchTicketAction } from "../actions";
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

  const [canned, clientRecord, sla] = await Promise.all([
    listCannedResponses().catch(() => []),
    ticket.client_id ? getClientById(ticket.client_id) : Promise.resolve(null),
    getTicketSla(ticket).catch(() => null),
  ]);

  const handover = [...messages]
    .reverse()
    .find((m) => m.role === "internal_note" && (m.channel_meta as { kind?: string })?.kind === "handover");

  return (
    <div className="flex h-full">
      <RefreshPoller />

      {/* Conversation column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Inbox
            </Link>
            <span className="text-sm text-ink-3">#{ticket.reference}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h1 className="mt-1 truncate text-base font-semibold">{ticket.subject}</h1>
          <p className="text-xs text-ink-2">
            {ticket.requester_name ? `${ticket.requester_name} · ` : ""}
            {ticket.requester_email} · opened {formatDateTime(ticket.created_at)}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {ticket.status === "escalated" && handover && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/25 dark:bg-red-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">AI handover</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">{handover.body_text}</pre>
            </div>
          )}

          {messages.map((message) => {
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

        <div className="border-t border-line bg-surface-2 p-4">
          <ReplyBox
            ticketId={ticket.id}
            canned={canned}
            vars={cannedVars}
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

      {/* Controls column (Customer 360 panel lands here in Phase 2) */}
      <aside className="w-[27rem] shrink-0 space-y-5 overflow-y-auto border-l border-line bg-surface-2/40 p-5">
        <form action={runAiAction}>
          <input type="hidden" name="ticketId" value={ticket.id} />
          <RunAiButton />
        </form>

        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Customer</h2>
          {clientRecord ? (
            <ClientPanel record={clientRecord} />
          ) : (
            <p className="rounded-lg border border-dashed border-line bg-surface p-3 text-xs text-ink-3">
              {ticket.client_id ? "Client record unavailable." : "No client record matched."}
            </p>
          )}
        </div>

        <form action={updateTicketAction} className="space-y-3 text-sm">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
            <label className="text-xs font-medium text-ink-2">Status</label>
            <select name="status" defaultValue={ticket.status} className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5">
              <option value="new">New</option>
              <option value="ai_working">AI working</option>
              <option value="waiting_on_customer">Waiting on customer</option>
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

          <form action={snoozeTicketAction} className="flex items-center gap-1">
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
  );
}
