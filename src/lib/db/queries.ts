import "server-only";
import { db } from "./client";
import { env } from "@/lib/env";
import type { Json, TablesInsert, TablesUpdate } from "./database.types";
import { ticketSla, type TicketSla } from "@/lib/sla";
import { aggregateKbEffectiveness, type KbEffectiveness, type KbUsageRow } from "@/lib/kb-effectiveness";
import { sanitizeSearchTerm } from "./search-term";
import type {
  AiOutcome,
  CannedResponse,
  ClientSupportHistory,
  KbArticle,
  KbSource,
  KbStatus,
  Message,
  OutreachIncident,
  PastTicketHit,
  SlaPolicy,
  Ticket,
  TicketChannel,
  TicketPriority,
  TicketSearchFilters,
  TicketSearchHit,
} from "./types";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

// ── Tickets ──────────────────────────────────────────────────────────────────

export type InboxView = "mine" | "unassigned" | "escalated" | "review" | "waiting" | "breaching" | "approval" | "open" | "all";

const OPEN_STATUSES = ["new", "ai_working", "waiting_on_customer", "escalated", "needs_review", "pending"] as const;

export async function createTicket(input: Omit<TablesInsert<"tickets">, "tenant_id">): Promise<Ticket> {
  const result = await db()
    .from("tickets")
    .insert({ ...input, tenant_id: env.tenantId })
    .select()
    .single();
  return unwrap(result, "createTicket");
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const { data, error } = await db().from("tickets").select().eq("id", id).maybeSingle();
  if (error) throw new Error(`getTicket: ${error.message}`);
  return data;
}

export async function getTicketWithMessages(id: string): Promise<{ ticket: Ticket; messages: Message[] } | null> {
  const ticket = await getTicket(id);
  if (!ticket) return null;
  const result = await db()
    .from("messages")
    .select()
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  return { ticket, messages: unwrap(result, "getTicketWithMessages") };
}

// --- Client portal reads: every query scoped to the signed-in requester's
// email, and internal notes / system messages are never exposed to a client. ---

export async function listRequesterTickets(email: string): Promise<Ticket[]> {
  const { data, error } = await db()
    .from("tickets")
    .select()
    .eq("tenant_id", env.tenantId)
    .eq("requester_email", email.toLowerCase())
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listRequesterTickets: ${error.message}`);
  return data ?? [];
}

/** True when this requester has an earlier ticket on record — lets us greet a
 *  returning contact with a "welcome back" instead of a first-time hello. Counts
 *  only tickets created strictly before `before` (the current ticket's own
 *  timestamp) so two near-simultaneous emails don't each treat the other as
 *  prior history. Callers should treat a throw as "not returning" (best-effort). */
export async function isReturningRequester(email: string, before: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!address) return false;
  const { count, error } = await db()
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", env.tenantId)
    .eq("requester_email", address)
    .lt("created_at", before);
  if (error) throw new Error(`isReturningRequester: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getRequesterTicket(
  id: string,
  email: string,
): Promise<{ ticket: Ticket; messages: Message[] } | null> {
  const { data: ticket, error } = await db()
    .from("tickets")
    .select()
    .eq("id", id)
    .eq("requester_email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`getRequesterTicket: ${error.message}`);
  if (!ticket) return null;
  const result = await db()
    .from("messages")
    .select()
    .eq("ticket_id", id)
    .in("role", ["customer", "ai", "human"]) // never expose internal_note / system
    .order("created_at", { ascending: true });
  return { ticket, messages: unwrap(result, "getRequesterTicket") };
}

/** Record a CSAT rating — only on resolved/closed tickets. Safe to call
 * from the public survey route (the caller verifies the signed token). */
export async function recordCsat(ticketId: string, score: number, comment: string | null): Promise<boolean> {
  const ticket = await getTicket(ticketId);
  if (!ticket || (ticket.status !== "resolved" && ticket.status !== "closed")) return false;
  const { error } = await db()
    .from("tickets")
    .update({ csat_score: score, csat_comment: comment })
    .eq("id", ticketId);
  if (error) throw new Error(`recordCsat: ${error.message}`);
  await audit("system", "csat", "csat.recorded", { type: "ticket", id: ticketId }, { score });
  return true;
}

export async function getTicketByReference(reference: number): Promise<Ticket | null> {
  const { data, error } = await db()
    .from("tickets")
    .select()
    .eq("tenant_id", env.tenantId)
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error(`getTicketByReference: ${error.message}`);
  return data;
}

export async function findTicketByThreadKey(threadKey: string): Promise<Ticket | null> {
  const { data, error } = await db()
    .from("tickets")
    .select()
    .eq("tenant_id", env.tenantId)
    .eq("email_thread_key", threadKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findTicketByThreadKey: ${error.message}`);
  return data;
}

export async function updateTicket(id: string, patch: TablesUpdate<"tickets">): Promise<Ticket> {
  const result = await db().from("tickets").update(patch).eq("id", id).select().single();
  return unwrap(result, "updateTicket");
}

export async function listTickets(view: InboxView, agentEmail: string): Promise<Ticket[]> {
  if (view === "breaching") return listBreachingTickets();

  // Snoozed tickets drop out of the active queues until their time is up.
  const activeNotSnoozed = `snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`;

  let query = db()
    .from("tickets")
    .select()
    .eq("tenant_id", env.tenantId)
    .order("updated_at", { ascending: false })
    .limit(100);

  switch (view) {
    case "mine":
      query = query.eq("assignee", agentEmail).in("status", [...OPEN_STATUSES]).or(activeNotSnoozed);
      break;
    case "unassigned":
      query = query.is("assignee", null).in("status", [...OPEN_STATUSES]).or(activeNotSnoozed);
      break;
    case "escalated":
      query = query.eq("status", "escalated");
      break;
    case "review":
      query = query.eq("status", "needs_review");
      break;
    case "waiting":
      query = query.eq("status", "waiting_on_customer");
      break;
    case "approval":
      query = query.eq("status", "awaiting_approval");
      break;
    case "open":
      query = query.in("status", [...OPEN_STATUSES]).or(activeNotSnoozed);
      break;
    case "all":
      break;
  }

  return unwrap(await query, `listTickets(${view})`);
}

export async function inboxCounts(agentEmail: string): Promise<Record<InboxView, number>> {
  const activeNotSnoozed = `snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`;
  const base = () => db().from("tickets").select("id", { count: "exact", head: true }).eq("tenant_id", env.tenantId);
  const [mine, unassigned, escalated, review, waiting, approval, open, all, breaching] = await Promise.all([
    base().eq("assignee", agentEmail).in("status", [...OPEN_STATUSES]).or(activeNotSnoozed),
    base().is("assignee", null).in("status", [...OPEN_STATUSES]).or(activeNotSnoozed),
    base().eq("status", "escalated"),
    base().eq("status", "needs_review"),
    base().eq("status", "waiting_on_customer"),
    base().eq("status", "awaiting_approval"),
    base().in("status", [...OPEN_STATUSES]).or(activeNotSnoozed),
    base(),
    listBreachingTickets(),
  ]);
  return {
    mine: mine.count ?? 0,
    unassigned: unassigned.count ?? 0,
    escalated: escalated.count ?? 0,
    review: review.count ?? 0,
    waiting: waiting.count ?? 0,
    approval: approval.count ?? 0,
    breaching: breaching.length,
    open: open.count ?? 0,
    all: all.count ?? 0,
  };
}

/** Customer 360 support history for a ticket's client — keyed on the matched
 *  Airtable client when we have one (company-wide view), else the requester's
 *  own email. Counts include the current ticket; the recent list excludes it.
 *  This is the frame the Phase 3 integration-error feed slots into later. */
export async function getClientSupportHistory(opts: {
  clientId: string | null;
  requesterEmail: string;
  excludeTicketId: string;
}): Promise<ClientSupportHistory> {
  const { clientId, requesterEmail, excludeTicketId } = opts;
  const email = requesterEmail.toLowerCase();
  const scope: ClientSupportHistory["scope"] = clientId ? "client" : "requester";

  const countBase = () => {
    const q = db().from("tickets").select("id", { count: "exact", head: true }).eq("tenant_id", env.tenantId);
    return clientId ? q.eq("client_id", clientId) : q.eq("requester_email", email);
  };
  const csatQuery = () => {
    const q = db().from("tickets").select("csat_score").eq("tenant_id", env.tenantId).not("csat_score", "is", null);
    return clientId ? q.eq("client_id", clientId) : q.eq("requester_email", email);
  };
  const recentQuery = () => {
    const q = db()
      .from("tickets")
      .select("id, reference, subject, status, created_at, ai_resolved")
      .eq("tenant_id", env.tenantId)
      .neq("id", excludeTicketId)
      .order("created_at", { ascending: false })
      .limit(5);
    return clientId ? q.eq("client_id", clientId) : q.eq("requester_email", email);
  };

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [total, open, last30, csat, recent] = await Promise.all([
    countBase(),
    countBase().in("status", [...OPEN_STATUSES]),
    countBase().gte("created_at", since30),
    csatQuery(),
    recentQuery(),
  ]);

  for (const r of [total, open, last30, csat, recent]) {
    if (r.error) throw new Error(`getClientSupportHistory: ${r.error.message}`);
  }

  const scores = (csat.data ?? [])
    .map((r) => r.csat_score)
    .filter((s): s is number => typeof s === "number");
  const csatAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return {
    scope,
    total: total.count ?? 0,
    open: open.count ?? 0,
    last30Days: last30.count ?? 0,
    csatAvg,
    csatCount: scores.length,
    recent: (recent.data ?? []) as ClientSupportHistory["recent"],
  };
}

/** Every ticket for a client — scoped by the matched Airtable client_id when we
 *  have one (company-wide, all contacts), else the requester's own email. Powers
 *  the agent-facing "all client tickets" page (search + sort happen client-side). */
export async function listClientTickets(opts: {
  clientId: string | null;
  requesterEmail: string;
}): Promise<Ticket[]> {
  const q = db()
    .from("tickets")
    .select()
    .eq("tenant_id", env.tenantId)
    .order("updated_at", { ascending: false })
    .limit(300);
  const scoped = opts.clientId
    ? q.eq("client_id", opts.clientId)
    : q.eq("requester_email", opts.requesterEmail.toLowerCase());
  return unwrap(await scoped, "listClientTickets");
}

/** Personal scorecard for an agent's "My day" home: tickets they resolved today
 *  and their CSAT across tickets assigned to them. */
export async function getAgentScorecard(
  agentEmail: string,
): Promise<{ resolvedToday: number; csatAvg: number | null; csatCount: number }> {
  const client = db();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [resolved, csat] = await Promise.all([
    client
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", env.tenantId)
      .eq("assignee", agentEmail)
      .in("status", ["resolved", "closed"])
      .gte("resolved_at", startOfDay.toISOString()),
    client
      .from("tickets")
      .select("csat_score")
      .eq("tenant_id", env.tenantId)
      .eq("assignee", agentEmail)
      .not("csat_score", "is", null)
      .limit(500),
  ]);
  if (resolved.error) throw new Error(`getAgentScorecard(resolved): ${resolved.error.message}`);
  if (csat.error) throw new Error(`getAgentScorecard(csat): ${csat.error.message}`);
  const scores = (csat.data ?? []).map((r) => r.csat_score).filter((s): s is number => typeof s === "number");
  return {
    resolvedToday: resolved.count ?? 0,
    csatAvg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    csatCount: scores.length,
  };
}

/** Tickets awaiting an agent/AI reply (latest message is the customer's), with
 *  the time we've been waiting since. Powers the inbox badge + stale-ticket cron. */
export async function awaitingResponse(): Promise<{ ticketId: string; waitingSince: string }[]> {
  const { data, error } = await db().rpc("tickets_awaiting_response", { p_tenant_id: env.tenantId });
  if (error) throw new Error(`awaitingResponse: ${error.message}`);
  return (data ?? []).map((r) => ({ ticketId: r.ticket_id, waitingSince: r.waiting_since }));
}

export async function getTicketsByIds(ids: string[]): Promise<Ticket[]> {
  if (!ids.length) return [];
  const result = await db().from("tickets").select().eq("tenant_id", env.tenantId).in("id", ids);
  return unwrap(result, "getTicketsByIds");
}

export type BulkPatch = Omit<TablesUpdate<"tickets">, "tags"> & { addTag?: string };

/** Apply one change to many tickets (tenant-scoped). addTag unions per-row. */
export async function bulkUpdateTickets(ids: string[], patch: BulkPatch): Promise<void> {
  if (!ids.length) return;
  const client = db();
  const { addTag, ...rest } = patch;

  if (Object.keys(rest).length > 0) {
    const { error } = await client.from("tickets").update(rest).eq("tenant_id", env.tenantId).in("id", ids);
    if (error) throw new Error(`bulkUpdateTickets: ${error.message}`);
  }

  if (addTag) {
    const { data, error } = await client
      .from("tickets")
      .select("id, tags")
      .eq("tenant_id", env.tenantId)
      .in("id", ids);
    if (error) throw new Error(`bulkUpdateTickets(tags): ${error.message}`);
    await Promise.all(
      (data ?? [])
        .filter((row) => !row.tags.includes(addTag))
        .map((row) =>
          client.from("tickets").update({ tags: [...row.tags, addTag] }).eq("id", row.id),
        ),
    );
  }
}

export async function mergeTickets(sourceId: string, targetId: string, actor: string): Promise<Ticket> {
  if (sourceId === targetId) throw new Error("mergeTickets: cannot merge a ticket into itself");
  const client = db();
  const [source, target] = await Promise.all([getTicket(sourceId), getTicket(targetId)]);
  if (!source || !target) throw new Error("mergeTickets: source or target not found");

  // Capture exactly which messages we're about to move, so the merge is
  // reversible (unmerge moves these same rows back and reopens the source).
  const listed = await client.from("messages").select("id").eq("ticket_id", sourceId).eq("tenant_id", env.tenantId);
  if (listed.error) throw new Error(`mergeTickets(list): ${listed.error.message}`);
  const movedIds = (listed.data ?? []).map((m) => m.id);

  const moved = await client.from("messages").update({ ticket_id: targetId }).eq("ticket_id", sourceId).eq("tenant_id", env.tenantId);
  if (moved.error) throw new Error(`mergeTickets(move): ${moved.error.message}`);

  const tags = [...new Set([...target.tags, ...source.tags])];
  const cc = [...new Set([...target.cc_emails, ...source.cc_emails])];
  const merged = await updateTicket(targetId, { tags, cc_emails: cc });

  const count = movedIds.length;
  await addMessage({
    ticket_id: targetId,
    role: "internal_note",
    author: actor,
    body_text: `Merged in #${source.reference} “${source.subject}” — ${count} message${count === 1 ? "" : "s"} moved into this ticket.`,
    channel_meta: {
      kind: "merge",
      direction: "in",
      other_id: sourceId,
      other_ref: source.reference,
      other_subject: source.subject,
      moved_ids: movedIds,
      source_prior: { status: source.status, resolved_at: source.resolved_at, escalation_reason: source.escalation_reason },
    } as Json,
  });
  await updateTicket(sourceId, {
    status: "closed",
    resolved_at: source.resolved_at ?? new Date().toISOString(),
    escalation_reason: null,
  });
  await addMessage({
    ticket_id: sourceId,
    role: "internal_note",
    author: actor,
    body_text: `Merged into #${target.reference} “${target.subject}”. The conversation continues there.`,
    channel_meta: { kind: "merge", direction: "into", other_id: targetId, other_ref: target.reference } as Json,
  });
  await audit("human", actor, "ticket.merged", { type: "ticket", id: sourceId }, { into: targetId, moved: count });
  return merged;
}

type MergeMeta = {
  kind?: string;
  direction?: string;
  other_id?: string;
  other_ref?: number;
  moved_ids?: string[];
  undone?: boolean;
  source_prior?: { status?: string; resolved_at?: string | null; escalation_reason?: string | null };
};

/** Reverse a merge: move the originally-merged messages back to the source
 *  ticket, reopen it to its pre-merge state, and mark the merge note consumed.
 *  Keyed on the "Merged in" note that carries the moved-message ids. */
export async function unmergeTickets(targetId: string, noteId: string, actor: string): Promise<void> {
  const client = db();
  const note = await getMessageById(noteId);
  if (!note || note.ticket_id !== targetId) throw new Error("unmergeTickets: merge note not found");
  const meta = (note.channel_meta ?? {}) as MergeMeta;
  if (meta.kind !== "merge" || meta.direction !== "in" || !meta.other_id || meta.undone) {
    throw new Error("unmergeTickets: not an active merge");
  }
  const sourceId = meta.other_id;
  const movedIds = Array.isArray(meta.moved_ids) ? meta.moved_ids : [];

  if (movedIds.length > 0) {
    const back = await client
      .from("messages")
      .update({ ticket_id: sourceId })
      .in("id", movedIds)
      .eq("ticket_id", targetId)
      .eq("tenant_id", env.tenantId);
    if (back.error) throw new Error(`unmergeTickets(move back): ${back.error.message}`);
  }

  // Reopen the source to its pre-merge state (fall back to a fresh ticket).
  await updateTicket(sourceId, {
    status: (meta.source_prior?.status as Ticket["status"] | undefined) ?? "new",
    resolved_at: meta.source_prior?.resolved_at ?? null,
    escalation_reason: meta.source_prior?.escalation_reason ?? null,
  });

  // Consume the merge note so the Unmerge button disappears and the trail reads true.
  const { error: noteErr } = await client
    .from("messages")
    .update({
      body_text: `${note.body_text} — unmerged; messages returned to #${meta.other_ref}.`,
      channel_meta: { ...meta, undone: true } as Json,
    })
    .eq("id", noteId);
  if (noteErr) throw new Error(`unmergeTickets(note): ${noteErr.message}`);

  const target = await getTicket(targetId);
  await addMessage({
    ticket_id: sourceId,
    role: "internal_note",
    author: actor,
    body_text: `Unmerged from #${target?.reference ?? "?"} — this ticket has been reopened.`,
  });
  await audit("human", actor, "ticket.unmerged", { type: "ticket", id: sourceId }, { from: targetId, moved: movedIds.length });
}

export type SearchResults = {
  tickets: Ticket[];
  messages: { ticketId: string; reference: number; subject: string; snippet: string; created_at: string }[];
  kb: { id: string; title: string; status: KbStatus }[];
};

export async function searchAll(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return { tickets: [], messages: [], kb: [] };
  const client = db();
  const tenant = env.tenantId;
  const refMatch = trimmed.match(/^#?(\d+)$/);

  let ticketQuery = client.from("tickets").select().eq("tenant_id", tenant).limit(25);
  if (refMatch) {
    ticketQuery = ticketQuery.eq("reference", Number(refMatch[1]));
  } else {
    // PostgREST parses , ( ) as or()-filter grammar and % _ as LIKE wildcards —
    // neutralise them (plus quote/backslash) so a search term can't restructure
    // the filter. Behaviour-preserving for ordinary text search.
    const safe = sanitizeSearchTerm(trimmed);
    ticketQuery = safe
      ? ticketQuery.or(`subject.ilike.%${safe}%,requester_email.ilike.%${safe}%,requester_name.ilike.%${safe}%`)
      : ticketQuery.eq("reference", -1); // term was all metacharacters → no match
  }

  const [tickets, messages, kb] = await Promise.all([
    ticketQuery,
    client
      .from("messages")
      .select("ticket_id, body_text, created_at, tickets!inner(reference, subject, tenant_id)")
      .eq("tickets.tenant_id", tenant)
      .textSearch("body_fts", trimmed, { type: "websearch" })
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("kb_articles")
      .select("id, title, status")
      .eq("tenant_id", tenant)
      .textSearch("body_fts", trimmed, { type: "websearch" })
      .limit(25),
  ]);

  if (tickets.error) throw new Error(`searchAll(tickets): ${tickets.error.message}`);

  type MessageHit = {
    ticket_id: string;
    body_text: string;
    created_at: string;
    tickets: { reference: number; subject: string } | { reference: number; subject: string }[] | null;
  };
  const messageHits = ((messages.data as MessageHit[] | null) ?? []).map((m) => {
    const t = Array.isArray(m.tickets) ? m.tickets[0] : m.tickets;
    return {
      ticketId: m.ticket_id,
      reference: t?.reference ?? 0,
      subject: t?.subject ?? "",
      snippet: m.body_text.slice(0, 200),
      created_at: m.created_at,
    };
  });

  return {
    tickets: tickets.data ?? [],
    messages: messageHits,
    kb: kb.data ?? [],
  };
}

/**
 * Ranked, content-aware ticket search: a ticket matches on its subject OR
 * anything said in its conversation, ranked by relevance, with a highlighted
 * (⟦…⟧) snippet of the matching text. Optional status / assignee / since filters.
 */
export async function searchTickets(
  query: string,
  filters: TicketSearchFilters = {},
): Promise<TicketSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const statuses = filters.statuses?.filter(Boolean) ?? [];
  const result = await db().rpc("search_tickets", {
    q,
    p_tenant: env.tenantId,
    p_statuses: statuses.length ? statuses : undefined,
    p_assignee: filters.assignee || undefined,
    p_since: filters.since || undefined,
    p_limit: 30,
  });
  return unwrap(result, "searchTickets") as TicketSearchHit[];
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function addMessage(input: Omit<TablesInsert<"messages">, "tenant_id">): Promise<Message> {
  const result = await db()
    .from("messages")
    .insert({ ...input, tenant_id: env.tenantId })
    .select()
    .single();
  return unwrap(result, "addMessage");
}

/** Count of an actor's recent audited actions in a window — lightweight,
 *  serverless-safe rate limiting (e.g. portal ask-box abuse). */
export async function recentActionCount(actor: string, action: string, withinSeconds: number): Promise<number> {
  const since = new Date(Date.now() - withinSeconds * 1000).toISOString();
  const { count, error } = await db()
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", env.tenantId)
    .eq("actor", actor)
    .eq("action", action)
    .gte("created_at", since);
  if (error) throw new Error(`recentActionCount: ${error.message}`);
  return count ?? 0;
}

export async function getMessageById(id: string): Promise<Message | null> {
  const { data, error } = await db().from("messages").select().eq("id", id).maybeSingle();
  if (error) throw new Error(`getMessageById: ${error.message}`);
  return data;
}

export async function setMessageAttachments(id: string, attachments: Json): Promise<void> {
  const { error } = await db().from("messages").update({ attachments }).eq("id", id);
  if (error) throw new Error(`setMessageAttachments: ${error.message}`);
}

/** Loop guard: AI replies on a ticket within the last N hours. */
export async function countRecentAiMessages(ticketId: string, hours: number): Promise<number> {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { count, error } = await db()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId)
    .eq("role", "ai")
    .gte("created_at", since);
  if (error) throw new Error(`countRecentAiMessages: ${error.message}`);
  return count ?? 0;
}

// ── Knowledge base ───────────────────────────────────────────────────────────

export async function listKbArticles(status?: KbStatus): Promise<KbArticle[]> {
  let query = db()
    .from("kb_articles")
    .select()
    .eq("tenant_id", env.tenantId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  return unwrap(await query, "listKbArticles");
}

export async function kbCounts(): Promise<Record<KbStatus, number>> {
  const base = (status: KbStatus) =>
    db()
      .from("kb_articles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", env.tenantId)
      .eq("status", status);
  const [draft, review, published, archived] = await Promise.all([
    base("draft"),
    base("review"),
    base("published"),
    base("archived"),
  ]);
  return {
    draft: draft.count ?? 0,
    review: review.count ?? 0,
    published: published.count ?? 0,
    archived: archived.count ?? 0,
  };
}

export async function getKbArticle(id: string): Promise<KbArticle | null> {
  const { data, error } = await db().from("kb_articles").select().eq("id", id).maybeSingle();
  if (error) throw new Error(`getKbArticle: ${error.message}`);
  return data;
}

/** A published article for the public help page. Returns null for any
 *  missing/draft/internal article so unpublished knowledge can never leak. */
export async function getPublishedKbArticle(id: string): Promise<KbArticle | null> {
  const { data, error } = await db()
    .from("kb_articles")
    .select()
    .eq("id", id)
    .eq("tenant_id", env.tenantId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`getPublishedKbArticle: ${error.message}`);
  return data;
}

export type KbPickerItem = { id: string; title: string; source_url: string | null };

/** Slim list of published articles for the reply-box "Link KB article" picker —
 *  title + id only, no bodies. */
export async function listPublishedKbForPicker(): Promise<KbPickerItem[]> {
  const { data, error } = await db()
    .from("kb_articles")
    .select("id, title, source_url")
    .eq("tenant_id", env.tenantId)
    .eq("status", "published")
    .order("title", { ascending: true })
    .limit(500);
  if (error) throw new Error(`listPublishedKbForPicker: ${error.message}`);
  return data ?? [];
}

/** Published articles the AI already surfaced on this ticket (free, accurate
 *  suggestions for the agent — no fresh embedding call). Most-relevant first:
 *  cited articles ahead of merely-retrieved ones. */
export async function getSurfacedKbForTicket(ticketId: string): Promise<KbPickerItem[]> {
  const { data: usage, error } = await db()
    .from("kb_article_usage")
    .select("article_id, cited")
    .eq("tenant_id", env.tenantId)
    .eq("ticket_id", ticketId);
  if (error) throw new Error(`getSurfacedKbForTicket: ${error.message}`);
  const rows = usage ?? [];
  if (rows.length === 0) return [];

  const cited = new Map(rows.map((r) => [r.article_id, r.cited]));
  const { data: articles, error: aErr } = await db()
    .from("kb_articles")
    .select("id, title, source_url")
    .in("id", [...cited.keys()])
    .eq("status", "published");
  if (aErr) throw new Error(`getSurfacedKbForTicket articles: ${aErr.message}`);
  return (articles ?? []).sort((a, b) => Number(cited.get(b.id)) - Number(cited.get(a.id)));
}

/** The KB articles the AI actually used on a ticket, with their bodies — the
 *  ground truth for source-grounded QA (checking the reply's claims are supported
 *  by what the AI was allowed to say). Cited (link-in-reply) sources come first. */
export async function getKbSourcesForTicket(
  ticketId: string,
  limit = 4,
): Promise<{ title: string; body: string }[]> {
  const { data: usage, error } = await db()
    .from("kb_article_usage")
    .select("article_id, cited")
    .eq("tenant_id", env.tenantId)
    .eq("ticket_id", ticketId);
  if (error) throw new Error(`getKbSourcesForTicket: ${error.message}`);
  const rows = usage ?? [];
  if (rows.length === 0) return [];

  const ordered = [...rows].sort((a, b) => Number(b.cited) - Number(a.cited)).slice(0, limit);
  const { data: articles, error: aErr } = await db()
    .from("kb_articles")
    .select("id, title, body")
    .in("id", ordered.map((r) => r.article_id));
  if (aErr) throw new Error(`getKbSourcesForTicket articles: ${aErr.message}`);
  const byId = new Map((articles ?? []).map((a) => [a.id, a]));
  return ordered
    .map((r) => byId.get(r.article_id))
    .filter((a): a is { id: string; title: string; body: string } => Boolean(a))
    .map((a) => ({ title: a.title, body: a.body }));
}

export async function createKbArticle(input: Omit<TablesInsert<"kb_articles">, "tenant_id">): Promise<KbArticle> {
  const result = await db()
    .from("kb_articles")
    .insert({ ...input, tenant_id: env.tenantId })
    .select()
    .single();
  return unwrap(result, "createKbArticle");
}

export async function updateKbArticle(id: string, patch: TablesUpdate<"kb_articles">): Promise<KbArticle> {
  const result = await db().from("kb_articles").update(patch).eq("id", id).select().single();
  return unwrap(result, "updateKbArticle");
}

// pgvector columns travel as JSON-encoded arrays through PostgREST. A null
// embedding publishes the article unsearchable-but-live (pre-go-live, before the
// embedding service is wired); it gets a vector once Voyage is available.
export async function publishKbArticle(id: string, embedding: number[] | null): Promise<KbArticle> {
  return updateKbArticle(id, { status: "published", embedding: embedding ? JSON.stringify(embedding) : null });
}

/** Human-resolved, previously-escalated tickets in a recent window — candidates
 *  for mining into KB articles (self-improvement loop). */
/** Human-resolved tickets worth mining into KB candidates: genuine escalations
 *  the AI couldn't answer, plus tickets where a human materially rewrote the AI's
 *  draft (tagged 'ai-corrected') — i.e. the AI got it wrong and the human taught
 *  it the right answer. Both feed the self-improvement loop. */
export async function listTicketsToMine(withinHours: number, limit = 50): Promise<Ticket[]> {
  const since = new Date(Date.now() - withinHours * 3_600_000).toISOString();
  const result = await db()
    .from("tickets")
    .select()
    .eq("tenant_id", env.tenantId)
    .in("status", ["resolved", "closed"])
    .eq("ai_resolved", false)
    .gte("resolved_at", since)
    .or("escalation_reason.not.is.null,tags.cs.{ai-corrected}")
    .order("resolved_at", { ascending: false })
    .limit(limit);
  return unwrap(result, "listTicketsToMine");
}

/** The text of the latest AI draft still sitting on a ticket (shadow / held for
 *  review), or null. Used to measure how much a human changed it on send. */
export async function getLatestAiDraft(ticketId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("messages")
    .select("channel_meta")
    .eq("ticket_id", ticketId)
    .eq("role", "internal_note")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`getLatestAiDraft: ${error.message}`);
  for (const row of data ?? []) {
    const meta = (row.channel_meta ?? {}) as { kind?: string; draft_text?: string };
    if (meta.kind === "shadow_draft" && meta.draft_text) return meta.draft_text;
  }
  return null;
}

/** Of the given tickets, which already have a KB article mined from them. */
export async function existingKbSourceTicketIds(ticketIds: string[]): Promise<Set<string>> {
  if (ticketIds.length === 0) return new Set();
  const { data, error } = await db()
    .from("kb_articles")
    .select("source_ticket_id")
    .eq("tenant_id", env.tenantId)
    .in("source_ticket_id", ticketIds);
  if (error) throw new Error(`existingKbSourceTicketIds: ${error.message}`);
  return new Set((data ?? []).map((r) => r.source_ticket_id).filter((id): id is string => Boolean(id)));
}

/** Source URLs already ingested for a crawled source (dedupe for the sync job). */
export async function existingKbSourceUrls(source: KbSource): Promise<Set<string>> {
  const { data, error } = await db()
    .from("kb_articles")
    .select("source_url")
    .eq("tenant_id", env.tenantId)
    .eq("source", source)
    .not("source_url", "is", null);
  if (error) throw new Error(`existingKbSourceUrls: ${error.message}`);
  return new Set((data ?? []).map((r) => r.source_url).filter((u): u is string => Boolean(u)));
}

export type KbMatch = { id: string; title: string; body: string; similarity: number; source_url: string | null };

export async function matchKbArticles(queryEmbedding: number[], count = 5): Promise<KbMatch[]> {
  const result = await db().rpc("match_kb_articles", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: count,
    p_tenant_id: env.tenantId,
  });
  return unwrap(result, "matchKbArticles");
}

// ── KB outcome attribution (self-correcting KB loop) ─────────────────────────

/** Record which KB articles were surfaced on a ticket, and which were cited in
 *  the reply actually sent. Upsert keyed on (article_id, ticket_id); "once
 *  cited, stays cited" across re-runs of the same ticket. */
export async function recordKbUsage(
  ticketId: string,
  items: { articleId: string; cited: boolean }[],
): Promise<void> {
  if (items.length === 0) return;
  // Collapse duplicate ids from multiple search_kb calls in a single run.
  const merged = new Map<string, boolean>();
  for (const it of items) merged.set(it.articleId, (merged.get(it.articleId) ?? false) || it.cited);

  // Don't let this run downgrade an article that a previous run cited.
  const { data: existing } = await db()
    .from("kb_article_usage")
    .select("article_id, cited")
    .eq("ticket_id", ticketId);
  for (const row of existing ?? []) {
    if (row.cited) merged.set(row.article_id, true);
  }

  const rows = [...merged].map(([article_id, cited]) => ({
    tenant_id: env.tenantId,
    article_id,
    ticket_id: ticketId,
    cited,
  }));
  const { error } = await db().from("kb_article_usage").upsert(rows, { onConflict: "article_id,ticket_id" });
  if (error) throw new Error(`recordKbUsage: ${error.message}`);
}

/** Per-article effectiveness across all recorded usage, joined to the live
 *  ticket state (so reopens/late CSAT are reflected). Powers the KB health line
 *  and the weekly digest's "articles to review". */
export async function getKbEffectiveness(): Promise<Map<string, KbEffectiveness>> {
  const { data: usage, error } = await db()
    .from("kb_article_usage")
    .select("article_id, ticket_id, cited")
    .eq("tenant_id", env.tenantId)
    .limit(20000);
  if (error) throw new Error(`getKbEffectiveness: ${error.message}`);
  const rows = usage ?? [];
  if (rows.length === 0) return new Map();

  const ticketIds = [...new Set(rows.map((r) => r.ticket_id))];
  const state = new Map<string, { ai_resolved: boolean | null; status: string | null; csat_score: number | null }>();
  for (let i = 0; i < ticketIds.length; i += 500) {
    const { data } = await db()
      .from("tickets")
      .select("id, ai_resolved, status, csat_score")
      .in("id", ticketIds.slice(i, i + 500));
    for (const t of data ?? []) state.set(t.id, { ai_resolved: t.ai_resolved, status: t.status, csat_score: t.csat_score });
  }

  const joined: KbUsageRow[] = rows.map((r) => ({
    article_id: r.article_id,
    cited: r.cited,
    ticket: state.get(r.ticket_id) ?? null,
  }));
  return aggregateKbEffectiveness(joined);
}

export type PastTicketMatch = {
  ticket_id: string;
  subject: string;
  snippet: string;
  resolved_at: string;
  rank: number;
};

export async function searchPastTickets(
  queryText: string,
  clientId: string | null,
  count = 5,
): Promise<PastTicketMatch[]> {
  const result = await db().rpc("search_past_tickets", {
    query_text: queryText,
    p_client_id: clientId ?? undefined,
    match_count: count,
    p_tenant_id: env.tenantId,
  });
  return unwrap(result, "searchPastTickets");
}

// ── Semantic ticket search (embeddings) ──────────────────────────────────────

/** Resolved/closed tickets by meaning (vector similarity), for the search box. */
export async function matchTickets(queryEmbedding: number[], count = 6): Promise<PastTicketHit[]> {
  const result = await db().rpc("match_tickets", {
    query_embedding: JSON.stringify(queryEmbedding),
    p_tenant: env.tenantId,
    match_count: count,
    min_similarity: 0.3,
  });
  return unwrap(result, "matchTickets") as PastTicketHit[];
}

/** The embed-tickets cron's work list: resolved/closed tickets not yet embedded. */
export async function listTicketsNeedingEmbedding(limit = 40): Promise<{ id: string; subject: string }[]> {
  const result = await db().rpc("tickets_needing_embedding", { p_tenant: env.tenantId, p_limit: limit });
  return unwrap(result, "listTicketsNeedingEmbedding") as { id: string; subject: string }[];
}

export async function upsertTicketEmbedding(ticketId: string, embedding: number[]): Promise<void> {
  const { error } = await db().from("ticket_embeddings").upsert({
    ticket_id: ticketId,
    tenant_id: env.tenantId,
    embedding: JSON.stringify(embedding),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`upsertTicketEmbedding: ${error.message}`);
}

// ── AI reply QA (independent guardrail judge) ────────────────────────────────

/** The QA cron's work list: AI-sent replies that haven't been graded yet. */
export async function listAiRepliesForQa(
  limit = 8,
): Promise<{ message_id: string; ticket_id: string; body_text: string; created_at: string }[]> {
  const result = await db().rpc("ai_replies_needing_qa", { p_tenant: env.tenantId, p_limit: limit });
  return unwrap(result, "listAiRepliesForQa");
}

export async function insertQaReview(input: Omit<TablesInsert<"qa_reviews">, "tenant_id">): Promise<void> {
  const { error } = await db().from("qa_reviews").insert({ ...input, tenant_id: env.tenantId });
  // A duplicate (message already reviewed) is fine — the work list prevents it,
  // but a race shouldn't error the run.
  if (error && !error.message.includes("duplicate")) throw new Error(`insertQaReview: ${error.message}`);
}

/** Pass/flag tally over a recent window, for the analytics QA tile. */
export async function qaSummary(days = 30): Promise<{ total: number; flagged: number }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("qa_reviews")
    .select("verdict")
    .eq("tenant_id", env.tenantId)
    .gte("created_at", since);
  if (error) throw new Error(`qaSummary: ${error.message}`);
  const rows = data ?? [];
  return { total: rows.length, flagged: rows.filter((r) => r.verdict === "flag").length };
}

// ── AI events / audit ────────────────────────────────────────────────────────

export async function insertAiEvent(input: {
  ticket_id: string;
  turn: number;
  model: string;
  tools_called: Json;
  confidence: number | null;
  outcome: AiOutcome;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}): Promise<void> {
  const { error } = await db()
    .from("ai_events")
    .insert({ ...input, tenant_id: env.tenantId });
  if (error) throw new Error(`insertAiEvent: ${error.message}`);
}

export async function audit(
  actorType: "ai" | "human" | "system",
  actor: string,
  action: string,
  target?: { type: string; id: string },
  detail: Json = {},
): Promise<void> {
  const { error } = await db().from("audit_log").insert({
    tenant_id: env.tenantId,
    actor_type: actorType,
    actor,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    detail,
  });
  // Audit failures are logged, not thrown — they must never break the pipeline.
  if (error) console.error(`audit(${action}): ${error.message}`);
}

// ── Channel sync state ───────────────────────────────────────────────────────

export async function getSyncState(channel: TicketChannel): Promise<Json> {
  const { data, error } = await db()
    .from("channel_sync_state")
    .select("state")
    .eq("tenant_id", env.tenantId)
    .eq("channel", channel)
    .maybeSingle();
  if (error) throw new Error(`getSyncState: ${error.message}`);
  return data?.state ?? {};
}

export async function setSyncState(channel: TicketChannel, state: Json): Promise<void> {
  const { error } = await db()
    .from("channel_sync_state")
    .upsert({ tenant_id: env.tenantId, channel, state, updated_at: new Date().toISOString() });
  if (error) throw new Error(`setSyncState: ${error.message}`);
}

// ── Proactive outreach ───────────────────────────────────────────────────────

export async function listOutreachIncidents(): Promise<OutreachIncident[]> {
  const { data, error } = await db()
    .from("outreach_incidents")
    .select()
    .eq("tenant_id", env.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listOutreachIncidents: ${error.message}`);
  return data ?? [];
}

export async function getOutreachIncident(id: string): Promise<OutreachIncident | null> {
  const { data, error } = await db().from("outreach_incidents").select().eq("id", id).maybeSingle();
  if (error) throw new Error(`getOutreachIncident: ${error.message}`);
  return data;
}

/** Oldest incident still being sent — the background drainer works one at a time. */
export async function getNextSendingOutreach(): Promise<OutreachIncident | null> {
  const { data, error } = await db()
    .from("outreach_incidents")
    .select()
    .eq("tenant_id", env.tenantId)
    .eq("status", "sending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getNextSendingOutreach: ${error.message}`);
  return data;
}

export async function createOutreachIncident(
  input: Omit<TablesInsert<"outreach_incidents">, "tenant_id">,
): Promise<OutreachIncident> {
  const result = await db()
    .from("outreach_incidents")
    .insert({ ...input, tenant_id: env.tenantId })
    .select()
    .single();
  return unwrap(result, "createOutreachIncident");
}

export async function updateOutreachIncident(
  id: string,
  patch: TablesUpdate<"outreach_incidents">,
): Promise<OutreachIncident> {
  const result = await db()
    .from("outreach_incidents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return unwrap(result, "updateOutreachIncident");
}

// ── Reference data ───────────────────────────────────────────────────────────

export async function listCannedResponses(): Promise<CannedResponse[]> {
  const result = await db()
    .from("canned_responses")
    .select()
    .eq("tenant_id", env.tenantId)
    .order("title");
  return unwrap(result, "listCannedResponses");
}

export async function createCannedResponse(title: string, body: string, createdBy: string): Promise<void> {
  const { error } = await db()
    .from("canned_responses")
    .insert({ tenant_id: env.tenantId, title, body, created_by: createdBy });
  if (error) throw new Error(`createCannedResponse: ${error.message}`);
}

export async function updateCannedResponse(id: string, title: string, body: string): Promise<void> {
  const { error } = await db()
    .from("canned_responses")
    .update({ title, body })
    .eq("tenant_id", env.tenantId)
    .eq("id", id);
  if (error) throw new Error(`updateCannedResponse: ${error.message}`);
}

export async function deleteCannedResponse(id: string): Promise<void> {
  const { error } = await db().from("canned_responses").delete().eq("tenant_id", env.tenantId).eq("id", id);
  if (error) throw new Error(`deleteCannedResponse: ${error.message}`);
}

export async function listTags(): Promise<{ id: string; name: string; color: string | null }[]> {
  const result = await db().from("tags").select("id, name, color").eq("tenant_id", env.tenantId).order("name");
  return unwrap(result, "listTags");
}

export async function createTag(name: string, color: string | null): Promise<void> {
  const { error } = await db()
    .from("tags")
    .insert({ tenant_id: env.tenantId, name, color })
    .select()
    .single();
  if (error) throw new Error(`createTag: ${error.message}`);
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await db().from("tags").delete().eq("tenant_id", env.tenantId).eq("id", id);
  if (error) throw new Error(`deleteTag: ${error.message}`);
}

export async function listBlockedSenders(): Promise<{ id: string; pattern: string }[]> {
  const result = await db().from("blocked_senders").select("id, pattern").eq("tenant_id", env.tenantId).order("pattern");
  return unwrap(result, "listBlockedSenders");
}

export async function getBlockedPatterns(): Promise<string[]> {
  const { data, error } = await db().from("blocked_senders").select("pattern").eq("tenant_id", env.tenantId);
  if (error) throw new Error(`getBlockedPatterns: ${error.message}`);
  return (data ?? []).map((r) => r.pattern);
}

export async function addBlockedSender(pattern: string, createdBy: string): Promise<void> {
  const normalised = pattern.toLowerCase().trim();
  if (!normalised) return;
  // Idempotent: re-blocking an already-blocked sender (double-click / race) must
  // not error — the ticket flow depends on this not throwing.
  const { error } = await db()
    .from("blocked_senders")
    .upsert(
      { tenant_id: env.tenantId, pattern: normalised, created_by: createdBy },
      { onConflict: "tenant_id,pattern", ignoreDuplicates: true },
    );
  if (error) throw new Error(`addBlockedSender: ${error.message}`);
}

export async function removeBlockedSender(id: string): Promise<void> {
  const { error } = await db().from("blocked_senders").delete().eq("tenant_id", env.tenantId).eq("id", id);
  if (error) throw new Error(`removeBlockedSender: ${error.message}`);
}

export async function listAllowedSenders(): Promise<{ id: string; pattern: string }[]> {
  const result = await db().from("allowed_senders").select("id, pattern").eq("tenant_id", env.tenantId).order("pattern");
  return unwrap(result, "listAllowedSenders");
}

export async function getAllowedPatterns(): Promise<string[]> {
  const { data, error } = await db().from("allowed_senders").select("pattern").eq("tenant_id", env.tenantId);
  if (error) throw new Error(`getAllowedPatterns: ${error.message}`);
  return (data ?? []).map((r) => r.pattern);
}

export async function addAllowedSender(pattern: string, createdBy: string): Promise<void> {
  const normalised = pattern.toLowerCase().trim();
  if (!normalised) return;
  // Idempotent: re-approving an already-allowed sender must not error.
  const { error } = await db()
    .from("allowed_senders")
    .upsert(
      { tenant_id: env.tenantId, pattern: normalised, created_by: createdBy },
      { onConflict: "tenant_id,pattern", ignoreDuplicates: true },
    );
  if (error) throw new Error(`addAllowedSender: ${error.message}`);
}

/** Bulk seed/import. Normalises, de-dupes, and skips rows that already exist.
 *  Returns the number of new patterns actually inserted. */
export async function addAllowedSenders(patterns: string[], createdBy: string): Promise<number> {
  const cleaned = [...new Set(patterns.map((p) => p.toLowerCase().trim()).filter(Boolean))];
  if (cleaned.length === 0) return 0;
  const rows = cleaned.map((pattern) => ({ tenant_id: env.tenantId, pattern, created_by: createdBy }));
  const { data, error } = await db()
    .from("allowed_senders")
    .upsert(rows, { onConflict: "tenant_id,pattern", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`addAllowedSenders: ${error.message}`);
  return (data ?? []).length;
}

export async function removeAllowedSender(id: string): Promise<void> {
  const { error } = await db().from("allowed_senders").delete().eq("tenant_id", env.tenantId).eq("id", id);
  if (error) throw new Error(`removeAllowedSender: ${error.message}`);
}

export async function listSlaPolicies(): Promise<SlaPolicy[]> {
  const result = await db().from("sla_policies").select().eq("tenant_id", env.tenantId).order("priority");
  return unwrap(result, "listSlaPolicies");
}

async function policyByPriority(): Promise<Map<TicketPriority, SlaPolicy>> {
  const policies = await listSlaPolicies();
  return new Map(policies.map((p) => [p.priority, p]));
}

function slaArgs(ticket: Ticket, policy: SlaPolicy) {
  return {
    createdAt: ticket.created_at,
    firstResponseAt: ticket.first_response_at,
    resolvedAt: ticket.resolved_at,
    firstResponseMinutes: policy.first_response_minutes,
    resolveMinutes: policy.resolve_minutes,
    businessHours: policy.business_hours,
  };
}

/** SLA status for a single ticket (policy chosen by priority). */
export async function getTicketSla(ticket: Ticket): Promise<TicketSla | null> {
  const policy = (await policyByPriority()).get(ticket.priority);
  if (!policy) return null;
  return ticketSla(slaArgs(ticket, policy));
}

/** Open tickets currently breaching their SLA (computed app-side for business hours). */
export async function listBreachingTickets(): Promise<Ticket[]> {
  const [tickets, policies] = await Promise.all([
    (async () => {
      const result = await db()
        .from("tickets")
        .select()
        .eq("tenant_id", env.tenantId)
        .in("status", [...OPEN_STATUSES])
        .order("created_at", { ascending: true })
        .limit(500);
      return unwrap(result, "listBreachingTickets");
    })(),
    policyByPriority(),
  ]);
  return tickets.filter((t) => {
    const policy = policies.get(t.priority);
    return policy ? ticketSla(slaArgs(t, policy)).breaching : false;
  });
}

// ── Presence (collision detection) ───────────────────────────────────────────

export type Viewer = { email: string; name: string | null };

/** Heartbeat: record that an agent is viewing a ticket, then return the OTHER
 *  agents seen within the last `freshSeconds`. One round-trip per poll. Rows go
 *  stale on their own — no cleanup needed (a closed tab just stops refreshing). */
export async function heartbeatPresence(
  ticketId: string,
  agentEmail: string,
  agentName: string | null,
  freshSeconds = 30,
): Promise<Viewer[]> {
  const client = db();
  const me = agentEmail.toLowerCase();
  const upsert = await client.from("ticket_presence").upsert(
    { ticket_id: ticketId, tenant_id: env.tenantId, agent_email: me, agent_name: agentName, last_seen: new Date().toISOString() },
    { onConflict: "ticket_id,agent_email" },
  );
  if (upsert.error) throw new Error(`heartbeatPresence(upsert): ${upsert.error.message}`);

  const since = new Date(Date.now() - freshSeconds * 1000).toISOString();
  const { data, error } = await client
    .from("ticket_presence")
    .select("agent_email, agent_name")
    .eq("ticket_id", ticketId)
    .neq("agent_email", me)
    .gte("last_seen", since);
  if (error) throw new Error(`heartbeatPresence(read): ${error.message}`);
  return (data ?? []).map((r) => ({ email: r.agent_email, name: r.agent_name }));
}
