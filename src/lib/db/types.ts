import type { Database, Tables } from "./database.types";

export type Ticket = Tables<"tickets">;
export type Message = Tables<"messages">;
export type KbArticle = Tables<"kb_articles">;
export type AiEvent = Tables<"ai_events">;
export type CannedResponse = Tables<"canned_responses">;
export type SlaPolicy = Tables<"sla_policies">;
export type Notification = Tables<"notifications">;
export type OutreachIncident = Tables<"outreach_incidents">;

/** A ranked ticket search hit — includes a highlighted "why it matched" snippet
 *  (⟦…⟧ marks the matching terms). */
export type TicketSearchHit = {
  id: string;
  reference: number;
  subject: string;
  requester_email: string;
  requester_name: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: string | null;
  updated_at: string;
  rank: number;
  snippet: string;
};

export type TicketSearchFilters = { statuses?: string[]; assignee?: string | null; since?: string | null };

/** A semantic KB search hit (vector + rerank), for the search results panel. */
export type KbSearchHit = { id: string; title: string; snippet: string; url: string | null; similarity: number };

export type SearchResponse = { tickets: TicketSearchHit[]; kb: KbSearchHit[] };

/** One affected client on a proactive outreach incident. */
export type OutreachRecipient = { email: string; name?: string | null };

export type ClientSupportHistoryItem = Pick<
  Ticket,
  "id" | "reference" | "subject" | "status" | "created_at" | "ai_resolved"
>;

/** Customer 360 support history — company-level when an Airtable client is
 *  matched, otherwise scoped to the requester's own email. */
export type ClientSupportHistory = {
  scope: "client" | "requester";
  total: number;
  open: number;
  last30Days: number;
  csatAvg: number | null;
  csatCount: number;
  recent: ClientSupportHistoryItem[];
};

export type TicketStatus = Database["public"]["Enums"]["ticket_status"];
export type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
export type TicketChannel = Database["public"]["Enums"]["ticket_channel"];
export type MessageRole = Database["public"]["Enums"]["message_role"];
export type KbStatus = Database["public"]["Enums"]["kb_status"];
export type KbSource = Database["public"]["Enums"]["kb_source"];
export type AiOutcome = Database["public"]["Enums"]["ai_outcome"];
