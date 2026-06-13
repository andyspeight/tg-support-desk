import "server-only";
import { runResolutionAgent } from "./agent";
import { mandatoryEscalation } from "./guardrails";
import { classifyTicket } from "./triage";
import { embedQuery } from "./embeddings";
import type { AgentOutcome, AgentRunResult, TicketContext, ToolExecutors } from "./types";
import {
  addMessage,
  audit,
  countRecentAiMessages,
  getTicketWithMessages,
  insertAiEvent,
  matchKbArticles,
  searchPastTickets,
  updateTicket,
} from "@/lib/db/queries";
import type { Message, Ticket } from "@/lib/db/types";
import { getClientById, matchClientByEmail, summariseClient } from "@/lib/integrations/airtable-clients";
import { sendTicketReply } from "@/lib/channels/email";
import { csatSurveyUrl } from "@/lib/csat";
import { env } from "@/lib/env";

// The resolution pipeline: every inbound customer message ends in exactly one
// of answered / clarifying question / explicit escalation. Never silent.

const AI_ACTOR = "resolution-agent";

export async function resolveTicket(
  ticketId: string,
  opts: { trigger: "email" | "manual"; actor?: string },
): Promise<AgentOutcome | null> {
  const loaded = await getTicketWithMessages(ticketId);
  if (!loaded) throw new Error(`resolveTicket: ticket ${ticketId} not found`);
  let { ticket } = loaded;
  const { messages } = loaded;

  if (ticket.status === "closed") return null;
  if (ticket.tags.includes("unverified-sender")) return null; // fail closed

  const latestCustomer = [...messages].reverse().find((m) => m.role === "customer");
  if (!latestCustomer) return null;

  // Loop guard: an address replying to every reply (misconfigured
  // auto-responder that slipped header detection) must not ping-pong with
  // the AI. Cap outbound AI replies per ticket per 24h, then hand to a human.
  if (opts.trigger === "email" && (await countRecentAiMessages(ticket.id, 24)) >= 5) {
    await addMessage({
      ticket_id: ticket.id,
      role: "internal_note",
      author: AI_ACTOR,
      body_text:
        "AI HANDOVER\nCategory: other\n\nLoop guard tripped: 5+ AI replies on this ticket in 24 hours. This looks like an email loop or an unusually long exchange — a human needs to take over.",
      channel_meta: { kind: "handover", category: "other", reason: "loop_suspected" },
    });
    await updateTicket(ticket.id, {
      status: "escalated",
      escalation_reason: "loop_suspected: 5+ AI replies in 24h",
    });
    await audit("system", AI_ACTOR, "ai.loop_guard_tripped", { type: "ticket", id: ticket.id });
    return null;
  }

  await audit("ai", AI_ACTOR, "ai.resolution_started", { type: "ticket", id: ticket.id }, { trigger: opts.trigger });
  ticket = await updateTicket(ticket.id, { status: "ai_working" });

  try {
    ticket = await ensureClientMatch(ticket);
    ticket = await applyTriage(ticket, latestCustomer.body_text);

    // Deterministic pre-check: commercial/legal/human-request topics never
    // reach the model — straight to escalation with a holding reply.
    const mandatory = mandatoryEscalation(latestCustomer.body_text);
    if (mandatory) {
      const outcome: AgentOutcome = {
        kind: "escalated",
        category: mandatory.category,
        reason: `guardrail match: "${mandatory.matched}"`,
        diagnosis: `The customer's message touches a topic the AI must not handle (${mandatory.category}, matched "${mandatory.matched}"). Policy escalation before any AI processing.`,
        stepsTried: ["inbound guardrail pre-check"],
        suggestedReply: "",
        holdingReply: holdingReplyTemplate(ticket),
      };
      await applyOutcome(ticket, outcome, null);
      return outcome;
    }

    const ctx = buildTicketContext(ticket, messages);
    const result = await runResolutionAgent(ctx, buildExecutors(ticket), {
      apiKey: env.anthropicApiKey,
      model: env.resolutionModel,
      maxTurns: env.aiMaxTurns,
      confidenceThreshold: env.aiConfidenceThreshold,
    });

    await applyOutcome(ticket, result.outcome, result);
    return result.outcome;
  } catch (error) {
    await failSafeEscalate(ticket, error);
    throw error;
  }
}

// Triage runs once per ticket (guarded on intent === null). Sets intent + tag,
// fills language if unknown, and raises priority off the p3 default — never
// downgrades a priority an agent set.
async function applyTriage(ticket: Ticket, body: string): Promise<Ticket> {
  if (ticket.intent) return ticket;

  const triage = await classifyTicket({
    subject: ticket.subject,
    body,
    apiKey: env.anthropicApiKey,
    model: env.utilityModel,
  });
  if (!triage) return ticket;

  const intentTag = `intent:${triage.intent}`;
  const patch: Parameters<typeof updateTicket>[1] = { intent: triage.intent };
  if (!ticket.tags.includes(intentTag)) patch.tags = [...ticket.tags, intentTag];
  if (!ticket.language) patch.language = triage.language;
  if (ticket.priority === "p3" && triage.priority !== "p3") patch.priority = triage.priority;

  await audit("ai", AI_ACTOR, "ai.triaged", { type: "ticket", id: ticket.id }, { ...triage });
  return updateTicket(ticket.id, patch);
}

async function ensureClientMatch(ticket: Ticket): Promise<Ticket> {
  if (ticket.client_id) return ticket;
  const match = await matchClientByEmail(ticket.requester_email);
  if (!match) return ticket;
  await audit("system", AI_ACTOR, "ticket.client_matched", { type: "ticket", id: ticket.id }, { client_id: match.id });
  return updateTicket(ticket.id, { client_id: match.id });
}

function buildTicketContext(ticket: Ticket, messages: Message[]): TicketContext {
  return {
    subject: ticket.subject,
    requesterName: ticket.requester_name,
    requesterEmail: ticket.requester_email,
    clientLine: ticket.client_id
      ? `Matched client record ${ticket.client_id} — use get_client_context for details.`
      : "No client record matched this requester.",
    transcript: messages
      .filter((m) => m.role !== "system")
      .slice(-20)
      .map((m) => ({
        role: m.role as "customer" | "ai" | "human" | "internal_note",
        body: m.body_text.slice(0, 6000),
      })),
  };
}

function buildExecutors(ticket: Ticket): ToolExecutors {
  return {
    search_kb: async (input) => {
      const query = String(input.query ?? "").trim();
      if (!query) return "Empty query.";
      const matches = await matchKbArticles(await embedQuery(query), 5);
      if (!matches.length) return "No relevant published KB articles found.";
      return matches
        .map(
          (m) =>
            `[similarity ${m.similarity.toFixed(2)}] ${m.title}\n${m.body.slice(0, 2000)}`,
        )
        .join("\n\n---\n\n");
    },

    get_client_context: async () => {
      if (!ticket.client_id) return "No client record matched for this requester.";
      const record = await getClientById(ticket.client_id);
      if (!record) return "Client record could not be loaded.";
      return summariseClient(record);
    },

    search_past_tickets: async (input) => {
      const query = String(input.query ?? "").trim();
      if (!query) return "Empty query.";
      let matches = await searchPastTickets(query, ticket.client_id, 5);
      if (matches.length < 2) {
        const global = await searchPastTickets(query, null, 5);
        const seen = new Set(matches.map((m) => m.ticket_id));
        matches = [...matches, ...global.filter((m) => !seen.has(m.ticket_id))].slice(0, 5);
      }
      if (!matches.length) return "No similar resolved tickets found.";
      return matches
        .map((m) => `Resolved ${m.resolved_at?.slice(0, 10) ?? "n/a"} — ${m.subject}\n${m.snippet}`)
        .join("\n\n---\n\n");
    },
  };
}

async function applyOutcome(ticket: Ticket, outcome: AgentOutcome, result: AgentRunResult | null): Promise<void> {
  if (outcome.kind === "answered" || outcome.kind === "clarified") {
    // On a resolving answer, invite a one-tap CSAT rating (when a public base
    // URL + signing secret are configured). Clarifying replies get no survey.
    let body = outcome.reply;
    if (outcome.kind === "answered" && env.appBaseUrl && env.csatSecret) {
      body += `\n\nHow did we do? Rate this support in one tap: ${csatSurveyUrl(env.appBaseUrl, ticket.id, env.csatSecret)}`;
    }
    await sendTicketReply(ticket, body, { role: "ai", author: AI_ACTOR });
    await updateTicket(ticket.id, {
      ...(outcome.language ? { language: outcome.language } : {}),
      ...(outcome.kind === "answered"
        ? { status: "resolved", ai_resolved: true, resolved_at: new Date().toISOString() }
        : { status: "waiting_on_customer" }),
    });
    await audit("ai", AI_ACTOR, `ai.${outcome.kind}`, { type: "ticket", id: ticket.id }, {
      confidence: outcome.confidence,
    });
  } else {
    // Handover package as a pinned internal note — escalations are 2-minute jobs.
    await addMessage({
      ticket_id: ticket.id,
      role: "internal_note",
      author: AI_ACTOR,
      body_text: formatHandoverNote(outcome),
      channel_meta: {
        kind: "handover",
        category: outcome.category,
        reason: outcome.reason,
        steps_tried: outcome.stepsTried,
        suggested_reply: outcome.suggestedReply,
      },
    });

    if (outcome.holdingReply) {
      await sendTicketReply(ticket, outcome.holdingReply, { role: "ai", author: AI_ACTOR });
    }

    await updateTicket(ticket.id, {
      status: "escalated",
      ai_resolved: false,
      escalation_reason: `${outcome.category}: ${outcome.reason}`.slice(0, 300),
    });
    await audit("ai", AI_ACTOR, "ai.escalated", { type: "ticket", id: ticket.id }, {
      category: outcome.category,
      reason: outcome.reason,
    });
  }

  if (result) {
    await insertAiEvent({
      ticket_id: ticket.id,
      turn: result.turns,
      model: result.model,
      // Tool names + status only — no inputs, keeping PII out of ai_events.
      tools_called: result.toolsCalled.map((t) => ({ ...t })),
      confidence: outcome.kind === "escalated" ? null : outcome.confidence,
      outcome: outcome.kind === "clarified" ? "clarified" : outcome.kind === "answered" ? "answered" : "escalated",
      latency_ms: result.latencyMs,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    });
    for (const call of result.toolsCalled) {
      await audit("ai", AI_ACTOR, "ai.tool_call", { type: "ticket", id: ticket.id }, { tool: call.name, ok: call.ok });
    }
  }
}

function formatHandoverNote(outcome: Extract<AgentOutcome, { kind: "escalated" }>): string {
  const steps = outcome.stepsTried.length ? outcome.stepsTried.map((s) => `- ${s}`).join("\n") : "- (none)";
  return [
    "AI HANDOVER",
    `Category: ${outcome.category}`,
    `Reason: ${outcome.reason}`,
    "",
    "Diagnosis:",
    outcome.diagnosis || "(none provided)",
    "",
    "Steps tried:",
    steps,
    "",
    "Suggested reply:",
    outcome.suggestedReply || "(none drafted)",
  ].join("\n");
}

function holdingReplyTemplate(ticket: Ticket): string {
  const firstName = ticket.requester_name?.split(/\s+/)[0] ?? "there";
  return `Hi ${firstName},

Thanks for getting in touch. This one needs a colleague rather than me, so I've passed it straight to the team with all the details — they'll come back to you as soon as possible.

Travelgenix Support`;
}

async function failSafeEscalate(ticket: Ticket, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await addMessage({
      ticket_id: ticket.id,
      role: "internal_note",
      author: AI_ACTOR,
      body_text: `AI HANDOVER\nCategory: tool_error\n\nThe resolution pipeline failed with an error and this ticket needs a human:\n${message.slice(0, 500)}`,
      channel_meta: { kind: "handover", category: "tool_error", reason: "pipeline_error" },
    });
    await updateTicket(ticket.id, {
      status: "escalated",
      escalation_reason: `tool_error: ${message}`.slice(0, 300),
    });
    await audit("system", AI_ACTOR, "ai.pipeline_error", { type: "ticket", id: ticket.id }, { error: message.slice(0, 500) });
  } catch (inner) {
    console.error("failSafeEscalate failed:", inner);
  }
}
