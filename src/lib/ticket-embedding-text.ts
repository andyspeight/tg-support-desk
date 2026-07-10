// Pure builder for the document we embed for semantic ticket search. Kept free
// of server deps so it stays unit-testable.

type EmbeddableMessage = { role: string; body_text: string };

/**
 * The text embedded for a ticket: its subject plus the customer/agent/AI
 * conversation. Internal notes and system messages (auto-acks, handovers) are
 * excluded so the vector reflects the actual issue and its resolution, not desk
 * chatter. Capped so a long thread stays within the embedding token budget.
 */
export function embeddableTicketText(subject: string, messages: EmbeddableMessage[]): string {
  const conversation = messages
    .filter((m) => m.role === "customer" || m.role === "ai" || m.role === "human")
    .map((m) => m.body_text.trim())
    .filter(Boolean)
    .join("\n\n");
  return `${subject}\n\n${conversation}`.slice(0, 8000).trim();
}
