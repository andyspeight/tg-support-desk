import "server-only";
import { db } from "./client";
import { env } from "@/lib/env";
import type { Json, TablesInsert, TablesUpdate } from "./database.types";
import type {
  AiOutcome,
  CannedResponse,
  KbArticle,
  KbStatus,
  Message,
  SlaPolicy,
  Ticket,
  TicketChannel,
} from "./types";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

// ── Tickets ──────────────────────────────────────────────────────────────────

export type InboxView = "mine" | "unassigned" | "escalated" | "waiting" | "open" | "all";

const OPEN_STATUSES = ["new", "ai_working", "waiting_on_customer", "escalated"] as const;

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
  let query = db()
    .from("tickets")
    .select()
    .eq("tenant_id", env.tenantId)
    .order("updated_at", { ascending: false })
    .limit(100);

  switch (view) {
    case "mine":
      query = query.eq("assignee", agentEmail).in("status", [...OPEN_STATUSES]);
      break;
    case "unassigned":
      query = query.is("assignee", null).in("status", [...OPEN_STATUSES]);
      break;
    case "escalated":
      query = query.eq("status", "escalated");
      break;
    case "waiting":
      query = query.eq("status", "waiting_on_customer");
      break;
    case "open":
      query = query.in("status", [...OPEN_STATUSES]);
      break;
    case "all":
      break;
  }

  return unwrap(await query, `listTickets(${view})`);
}

export async function inboxCounts(agentEmail: string): Promise<Record<InboxView, number>> {
  const base = () => db().from("tickets").select("id", { count: "exact", head: true }).eq("tenant_id", env.tenantId);
  const [mine, unassigned, escalated, waiting, open, all] = await Promise.all([
    base().eq("assignee", agentEmail).in("status", [...OPEN_STATUSES]),
    base().is("assignee", null).in("status", [...OPEN_STATUSES]),
    base().eq("status", "escalated"),
    base().eq("status", "waiting_on_customer"),
    base().in("status", [...OPEN_STATUSES]),
    base(),
  ]);
  return {
    mine: mine.count ?? 0,
    unassigned: unassigned.count ?? 0,
    escalated: escalated.count ?? 0,
    waiting: waiting.count ?? 0,
    open: open.count ?? 0,
    all: all.count ?? 0,
  };
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

  // Move every message across, then carry tags + cc, then close the source.
  const moved = await client.from("messages").update({ ticket_id: targetId }).eq("ticket_id", sourceId);
  if (moved.error) throw new Error(`mergeTickets(move): ${moved.error.message}`);

  const tags = [...new Set([...target.tags, ...source.tags])];
  const cc = [...new Set([...target.cc_emails, ...source.cc_emails])];
  const merged = await updateTicket(targetId, { tags, cc_emails: cc });

  await addMessage({
    ticket_id: targetId,
    role: "internal_note",
    author: actor,
    body_text: `Merged in ticket #${source.reference} (${source.subject}).`,
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
    body_text: `Merged into ticket #${target.reference}. Conversation continues there.`,
  });
  await audit("human", actor, "ticket.merged", { type: "ticket", id: sourceId }, { into: targetId });
  return merged;
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
  ticketQuery = refMatch
    ? ticketQuery.eq("reference", Number(refMatch[1]))
    : ticketQuery.or(`subject.ilike.%${trimmed}%,requester_email.ilike.%${trimmed}%,requester_name.ilike.%${trimmed}%`);

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

// ── Messages ─────────────────────────────────────────────────────────────────

export async function addMessage(input: Omit<TablesInsert<"messages">, "tenant_id">): Promise<Message> {
  const result = await db()
    .from("messages")
    .insert({ ...input, tenant_id: env.tenantId })
    .select()
    .single();
  return unwrap(result, "addMessage");
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

// pgvector columns travel as JSON-encoded arrays through PostgREST.
export async function publishKbArticle(id: string, embedding: number[]): Promise<KbArticle> {
  return updateKbArticle(id, { status: "published", embedding: JSON.stringify(embedding) });
}

export type KbMatch = { id: string; title: string; body: string; similarity: number };

export async function matchKbArticles(queryEmbedding: number[], count = 5): Promise<KbMatch[]> {
  const result = await db().rpc("match_kb_articles", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: count,
    p_tenant_id: env.tenantId,
  });
  return unwrap(result, "matchKbArticles");
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

export async function listSlaPolicies(): Promise<SlaPolicy[]> {
  const result = await db().from("sla_policies").select().eq("tenant_id", env.tenantId).order("priority");
  return unwrap(result, "listSlaPolicies");
}
