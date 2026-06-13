import Anthropic from "@anthropic-ai/sdk";
import type { TicketPriority } from "@/lib/db/types";

// Cheap utility-model triage on ingest: classify intent, suggest priority,
// detect language. Replaces Freshdesk-style dispatch/observer rules with one
// call and seeds the intent taxonomy the analytics + weekly gap digest need.
// Non-fatal: any failure returns null and the pipeline proceeds untagged.

export const TRIAGE_INTENTS = [
  "how_to",
  "widget",
  "supplier_integration",
  "deeplinks",
  "booking_issue",
  "content_seo",
  "account_admin",
  "billing_commercial",
  "bug_report",
  "other",
] as const;

export type TriageIntent = (typeof TRIAGE_INTENTS)[number];

export type TriageResult = {
  intent: TriageIntent;
  priority: TicketPriority;
  language: string;
};

const TRIAGE_TOOL: Anthropic.Tool = {
  name: "classify_ticket",
  description: "Record the classification of a support ticket.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: [...TRIAGE_INTENTS],
        description:
          "Best-fit category. how_to = using the platform; widget = embedding/config of booking widgets; supplier_integration = supplier credentials/connectivity/missing results; deeplinks = deeplink URLs; booking_issue = search/results/booking failures; content_seo = CMS/blog/SEO; account_admin = users/roles/login/access; billing_commercial = pricing/invoices/refunds/contracts; bug_report = something broken in the product; other = none of these.",
      },
      priority: {
        type: "string",
        enum: ["p1", "p2", "p3"],
        description:
          "p1 = client's live site/bookings broken or revenue-impacting now; p2 = important but not outage; p3 = question, how-to, or low urgency.",
      },
      language: {
        type: "string",
        description: "ISO 639-1 code of the customer's message language, e.g. 'en', 'de', 'fr'.",
      },
    },
    required: ["intent", "priority", "language"],
    additionalProperties: false,
  },
};

const PRIORITIES = new Set<TicketPriority>(["p1", "p2", "p3"]);

/** Normalise raw tool input into a valid TriageResult (pure, testable). */
export function parseTriageResult(input: Record<string, unknown>): TriageResult {
  const rawIntent = String(input.intent ?? "").trim() as TriageIntent;
  const intent = TRIAGE_INTENTS.includes(rawIntent) ? rawIntent : "other";

  const rawPriority = String(input.priority ?? "").trim().toLowerCase() as TicketPriority;
  const priority = PRIORITIES.has(rawPriority) ? rawPriority : "p3";

  const rawLang = String(input.language ?? "").trim().toLowerCase();
  const language = /^[a-z]{2}$/.test(rawLang) ? rawLang : "en";

  return { intent, priority, language };
}

export async function classifyTicket(args: {
  subject: string;
  body: string;
  apiKey: string;
  model: string;
}): Promise<TriageResult | null> {
  try {
    const anthropic = new Anthropic({ apiKey: args.apiKey });
    const response = await anthropic.messages.create({
      model: args.model,
      max_tokens: 512,
      tools: [TRIAGE_TOOL],
      tool_choice: { type: "tool", name: "classify_ticket" },
      messages: [
        {
          role: "user",
          content: `Classify this Travelgenix support ticket.\n\nSubject: ${args.subject}\n\nMessage:\n${args.body.slice(0, 4000)}`,
        },
      ],
    });
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) return null;
    return parseTriageResult(toolUse.input as Record<string, unknown>);
  } catch (error) {
    console.error("classifyTicket failed:", error);
    return null;
  }
}
