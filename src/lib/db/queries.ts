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

// ── Messages ─────────────────────────────────────────────────────────────────

export async function addMessage(input: Omit<TablesInsert<"messages">, "tenant_id">): Promise<Message> {
  const result = await db()
    .from("messages")
    .insert({ ...input, tenant_id: env.tenantId })
    .select()
    .single();
  return unwrap(result, "addMessage");
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

export async function listSlaPolicies(): Promise<SlaPolicy[]> {
  const result = await db().from("sla_policies").select().eq("tenant_id", env.tenantId).order("priority");
  return unwrap(result, "listSlaPolicies");
}
