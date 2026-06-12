import type Anthropic from "@anthropic-ai/sdk";

// Tool definitions for the resolution agent. Executors are injected
// separately (production wiring in resolve.ts, fixtures in the eval harness)
// so this file stays pure.

export const TERMINAL_TOOL_NAMES = new Set(["send_reply", "escalate"]);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "search_kb",
    description:
      "Search the published Travelgenix knowledge base. Call this before answering any question about product behaviour, configuration, supplier integrations, widgets, deeplinks or how-tos — answers must come from KB content, not from memory. Returns the most relevant published articles with similarity scores. If results look weak, rephrase the query and search once more.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to look for, phrased as the underlying question (not the customer's exact words).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_client_context",
    description:
      "Fetch the verified client record for this ticket's requester from the Travelgenix client database: company, plan, supplier integrations, websites, key contacts. Call this when the answer depends on the client's specific setup. The client is resolved server-side from the ticket — you cannot look up other clients.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "search_past_tickets",
    description:
      "Search previously resolved support tickets for similar issues and how they were solved — this client's history first, then all clients. Call this when the issue looks recurring, client-specific, or like a known problem.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords describing the issue.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "send_reply",
    description:
      "End your turn by sending this reply to the customer. Use outcome 'answered' only when the reply genuinely resolves the request using facts grounded in tool results; use 'clarifying_question' when you need exactly one piece of information to proceed. confidence is your honest 0–1 estimate that the reply fully and correctly resolves the request.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description: "The complete reply, ready to email — plain text, in the customer's language.",
        },
        outcome: {
          type: "string",
          enum: ["answered", "clarifying_question"],
        },
        confidence: {
          type: "number",
          description: "0–1 estimate that this reply fully resolves the request.",
        },
        language: {
          type: "string",
          description: "ISO 639-1 code of the reply language, e.g. 'en', 'de'.",
        },
      },
      required: ["body", "outcome", "confidence"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate",
    description:
      "End your turn by handing this ticket to a human agent. Provide the full handover package so the escalation becomes a two-minute job: a one-paragraph diagnosis, what you already tried, and a complete suggested reply the agent can edit and send. Include holding_reply — a short interim message in the customer's language saying a colleague will follow up — unless one has already been sent on this ticket.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "human_requested",
            "commercial_or_billing",
            "legal",
            "missing_knowledge",
            "tool_error",
            "low_confidence",
            "complex_or_risky",
            "other",
          ],
        },
        diagnosis: {
          type: "string",
          description: "One paragraph: what the customer needs, what you found, and why this needs a human.",
        },
        steps_tried: {
          type: "array",
          items: { type: "string" },
          description: "What you searched/checked and what came back.",
        },
        suggested_reply: {
          type: "string",
          description: "A complete draft reply the human agent can edit and send.",
        },
        holding_reply: {
          type: "string",
          description: "Short interim message to send to the customer now, in their language.",
        },
      },
      required: ["category", "diagnosis", "suggested_reply"],
      additionalProperties: false,
    },
  },
];
