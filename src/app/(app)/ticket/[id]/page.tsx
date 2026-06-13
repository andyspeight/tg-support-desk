import Link from "next/link";
import { notFound } from "next/navigation";
import { getTicketSla, getTicketWithMessages, listCannedResponses } from "@/lib/db/queries";
import type { ClockState } from "@/lib/sla";
import { getClientById, summariseClient } from "@/lib/integrations/airtable-clients";
import { env } from "@/lib/env";
import type { Message } from "@/lib/db/types";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { RefreshPoller } from "@/components/refresh-poller";
import { ReplyBox } from "@/components/reply-box";
import { addNoteAction, mergeTicketAction, runAiAction, sendReplyAction, updateTicketAction } from "../actions";

const ROLE_STYLES: Record<Message["role"], { label: string; className: string }> = {
  customer: { label: "Customer", className: "border-zinc-200 bg-white" },
  ai: { label: "AI", className: "border-violet-200 bg-violet-50" },
  human: { label: "Agent", className: "border-emerald-200 bg-emerald-50" },
  internal_note: { label: "Internal note", className: "border-amber-200 bg-amber-50" },
  system: { label: "System", className: "border-zinc-200 bg-zinc-50" },
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
  met: { text: "met", cls: "text-emerald-600" },
  late: { text: "met late", cls: "text-amber-600" },
  pending: { text: "due", cls: "text-zinc-600" },
  breached: { text: "breached", cls: "font-semibold text-red-600" },
};

function MessageAttachments({ messageId, attachments }: { messageId: string; attachments: unknown }) {
  const list = (Array.isArray(attachments) ? attachments : []) as MessageAttachment[];
  if (list.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2 border-t border-black/5 pt-2">
      {list.map((a, i) =>
        a.stored ? (
          <a
            key={i}
            href={`/api/attachments/${messageId}/${i}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 hover:border-zinc-400"
          >
            <span aria-hidden>📎</span>
            <span className="max-w-[200px] truncate">{a.filename}</span>
            <span className="text-zinc-400">{formatBytes(a.size)}</span>
          </a>
        ) : (
          <span
            key={i}
            title={a.rejected}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-200 px-2 py-1 text-xs text-zinc-400"
          >
            <span aria-hidden>⚠</span>
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
        <div className="border-b border-zinc-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/inbox" className="text-sm text-zinc-400 hover:text-zinc-700">
              ← Inbox
            </Link>
            <span className="text-sm text-zinc-400">#{ticket.reference}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h1 className="mt-1 truncate text-base font-semibold">{ticket.subject}</h1>
          <p className="text-xs text-zinc-500">
            {ticket.requester_name ? `${ticket.requester_name} · ` : ""}
            {ticket.requester_email} · opened {formatDateTime(ticket.created_at)}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {ticket.status === "escalated" && handover && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">AI handover</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-800">{handover.body_text}</pre>
            </div>
          )}

          {messages.map((message) => {
            const style = ROLE_STYLES[message.role];
            return (
              <div key={message.id} className={`rounded-lg border p-3 ${style.className}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-700">
                    {style.label}
                    {message.author && message.author !== "resolution-agent" ? ` · ${message.author}` : ""}
                  </span>
                  <span className="text-xs text-zinc-400">{formatDateTime(message.created_at)}</span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm text-zinc-800">{message.body_text}</pre>
                <MessageAttachments messageId={message.id} attachments={message.attachments} />
              </div>
            );
          })}
        </div>

        <div className="border-t border-zinc-200 bg-zinc-50 p-4">
          <ReplyBox ticketId={ticket.id} canned={canned} sendReply={sendReplyAction} addNote={addNoteAction} />
        </div>
      </div>

      {/* Controls column (Customer 360 panel lands here in Phase 2) */}
      <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-zinc-200 bg-white p-4">
        <form action={runAiAction}>
          <input type="hidden" name="ticketId" value={ticket.id} />
          <button className="w-full rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500">
            Run AI on this ticket
          </button>
        </form>

        <form action={updateTicketAction} className="space-y-3 text-sm">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
            <label className="text-xs font-medium text-zinc-500">Status</label>
            <select name="status" defaultValue={ticket.status} className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5">
              <option value="new">New</option>
              <option value="ai_working">AI working</option>
              <option value="waiting_on_customer">Waiting on customer</option>
              <option value="escalated">Escalated</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Priority</label>
            <select name="priority" defaultValue={ticket.priority} className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5">
              <option value="p1">P1 — Urgent</option>
              <option value="p2">P2 — Standard</option>
              <option value="p3">P3 — Low</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Assignee</label>
            <select name="assignee" defaultValue={ticket.assignee ?? ""} className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5">
              <option value="">Unassigned</option>
              {env.agentEmails.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Tags (comma-separated)</label>
            <input
              name="tags"
              defaultValue={ticket.tags.join(", ")}
              className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5"
            />
          </div>
          <button className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50">
            Update ticket
          </button>
        </form>

        {ticket.escalation_reason && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-red-700">
            <span className="font-semibold">Escalation:</span> {ticket.escalation_reason}
          </div>
        )}

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Client</h2>
          {clientRecord ? (
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50 p-2 font-sans text-xs text-zinc-600">
              {summariseClient(clientRecord).split("\n").slice(0, 12).join("\n")}
            </pre>
          ) : (
            <p className="mt-2 text-xs text-zinc-400">
              {ticket.client_id ? "Client record unavailable." : "No client record matched."}
            </p>
          )}
        </div>

        <form action={mergeTicketAction} className="border-t border-zinc-100 pt-3">
          <label className="text-xs font-medium text-zinc-500">Merge into ticket #</label>
          <div className="mt-1 flex gap-2">
            <input
              name="targetRef"
              inputMode="numeric"
              placeholder="ref"
              className="w-20 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            />
            <input type="hidden" name="ticketId" value={ticket.id} />
            <button className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              Merge
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">Moves this conversation into the target and closes this one.</p>
        </form>

        {sla && (
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-500">
            <p className="font-medium text-zinc-600">SLA</p>
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

        <div className="text-xs text-zinc-400">
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
