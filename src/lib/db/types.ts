import type { Database, Tables } from "./database.types";

export type Ticket = Tables<"tickets">;
export type Message = Tables<"messages">;
export type KbArticle = Tables<"kb_articles">;
export type AiEvent = Tables<"ai_events">;
export type CannedResponse = Tables<"canned_responses">;
export type SlaPolicy = Tables<"sla_policies">;
export type Notification = Tables<"notifications">;

export type TicketStatus = Database["public"]["Enums"]["ticket_status"];
export type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
export type TicketChannel = Database["public"]["Enums"]["ticket_channel"];
export type MessageRole = Database["public"]["Enums"]["message_role"];
export type KbStatus = Database["public"]["Enums"]["kb_status"];
export type KbSource = Database["public"]["Enums"]["kb_source"];
export type AiOutcome = Database["public"]["Enums"]["ai_outcome"];
