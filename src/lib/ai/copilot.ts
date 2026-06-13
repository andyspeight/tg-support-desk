import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { getTicketWithMessages, matchKbArticles } from "@/lib/db/queries";
import { embedQuery } from "./embeddings";

// Agent copilot: drafting and rewriting help for the human side. Grounded in
// the same KB as the resolution agent, in Travelgenix brand voice. These
// assist an agent — they never auto-send.

const BRAND_VOICE =
  "Travelgenix brand voice: warm, plain, professional UK English. Sound like a knowledgeable colleague, not a bot — no 'I hope this finds you well', no 'we sincerely apologise for any inconvenience', no exclamation-mark enthusiasm. Short paragraphs, specific, plain text only.";

async function complete(model: string, system: string, prompt: string, maxTokens = 1500): Promise<string> {
  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const res = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function threadText(messages: { role: string; body_text: string }[]): string {
  const label: Record<string, string> = {
    customer: "Customer",
    ai: "AI",
    human: "Agent",
    internal_note: "Internal note",
    system: "System",
  };
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => `[${label[m.role] ?? m.role}]\n${m.body_text.trim()}`)
    .join("\n\n");
}

/** Draft a reply for the agent, grounded in the KB. */
export async function copilotDraft(ticketId: string): Promise<string> {
  const loaded = await getTicketWithMessages(ticketId);
  if (!loaded) throw new Error("ticket not found");
  const latestCustomer = [...loaded.messages].reverse().find((m) => m.role === "customer");
  const query = latestCustomer?.body_text ?? loaded.ticket.subject;

  let kb = "";
  try {
    const matches = await matchKbArticles(await embedQuery(query), 4);
    kb = matches.map((m) => `## ${m.title}\n${m.body.slice(0, 1500)}`).join("\n\n");
  } catch {
    // embeddings/KB unavailable — draft from the thread alone, still useful.
  }

  const system = `You are drafting a support reply for a Travelgenix agent to review and edit before sending. ${BRAND_VOICE} Ground factual claims in the knowledge base provided; if the KB doesn't cover it, write what you safely can and leave a [bracketed note] where the agent must confirm details. Never promise refunds, credits, discounts or contract changes. Open with the customer's first name and sign off as "Travelgenix Support".`;
  const prompt = `Knowledge base:\n${kb || "(no relevant articles found)"}\n\nConversation so far:\n${threadText(loaded.messages)}\n\nDraft the next reply to the customer.`;
  return complete(env.resolutionModel, system, prompt);
}

/** One-paragraph summary of the whole thread for fast triage. */
export async function copilotSummarise(ticketId: string): Promise<string> {
  const loaded = await getTicketWithMessages(ticketId);
  if (!loaded) throw new Error("ticket not found");
  const system =
    "Summarise this support ticket for an agent picking it up cold: the customer's issue, what's been tried, and what's outstanding. One tight paragraph, plain UK English, no preamble.";
  return complete(env.utilityModel, system, threadText(loaded.messages), 500);
}

/** Rewrite agent-supplied text into brand voice. */
export async function copilotRephrase(text: string): Promise<string> {
  const system = `Rewrite the agent's draft into ${BRAND_VOICE} Keep the meaning and any specifics exactly; only improve tone and clarity. Return only the rewritten text.`;
  return complete(env.utilityModel, system, text);
}

/** Translate text into the target language, preserving meaning and tone. */
export async function copilotTranslate(text: string, targetLanguage: string): Promise<string> {
  const system = `Translate the text into ${targetLanguage}. Preserve meaning, tone and formatting. Return only the translation.`;
  return complete(env.utilityModel, system, text);
}
