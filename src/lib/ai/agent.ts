import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildTicketPrompt } from "./prompts";
import { TOOL_DEFINITIONS, TERMINAL_TOOL_NAMES } from "./tools";
import { violatesCommercialGuardrail } from "./guardrails";
import type {
  AgentConfig,
  AgentOutcome,
  AgentRunResult,
  EscalationCategory,
  TicketContext,
  ToolCallRecord,
  ToolExecutors,
} from "./types";

// Manual tool loop (not the SDK tool runner) so every tool call can be
// validated, recorded in ai_events and written to the audit log.

const ESCALATION_CATEGORIES: EscalationCategory[] = [
  "human_requested",
  "commercial_or_billing",
  "legal",
  "missing_knowledge",
  "tool_error",
  "low_confidence",
  "complex_or_risky",
  "other",
];

export async function runResolutionAgent(
  ctx: TicketContext,
  executors: ToolExecutors,
  config: AgentConfig,
): Promise<AgentRunResult> {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const startedAt = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildTicketPrompt(ctx) }];
  const toolsCalled: ToolCallRecord[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let nudged = false;
  let turns = 0;

  const finish = (outcome: AgentOutcome): AgentRunResult => ({
    outcome,
    toolsCalled,
    turns,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
    model: config.model,
  });

  const escalateInternal = (category: EscalationCategory, reason: string, diagnosis: string): AgentRunResult =>
    finish({
      kind: "escalated",
      category,
      reason,
      diagnosis,
      stepsTried: toolsCalled.map((t) => t.name),
      suggestedReply: "",
      holdingReply: null,
    });

  while (turns < config.maxTurns) {
    turns += 1;

    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      output_config: { effort: "high" },
      // Fable 5: thinking is always on and the param must be omitted entirely.
      ...(config.model.startsWith("claude-fable") || config.model.startsWith("claude-mythos")
        ? {}
        : { thinking: { type: "adaptive" as const } }),
      messages,
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      return escalateInternal(
        "other",
        "model_refusal",
        "The model's safety layer declined to process this ticket. A human needs to review it.",
      );
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      if (nudged) break;
      nudged = true;
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: "End your turn by calling exactly one of send_reply or escalate." });
      continue;
    }

    const terminal = toolUses.find((t) => TERMINAL_TOOL_NAMES.has(t.name));
    if (terminal) {
      toolsCalled.push({ name: terminal.name, ok: true });
      return finish(
        outcomeFromTerminalCall(
          terminal.name,
          terminal.input as Record<string, unknown>,
          config.confidenceThreshold,
        ),
      );
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const executor = executors[call.name];
      try {
        if (!executor) throw new Error(`Unknown tool: ${call.name}`);
        const output = await executor(call.input as Record<string, unknown>);
        toolsCalled.push({ name: call.name, ok: true });
        results.push({ type: "tool_result", tool_use_id: call.id, content: output });
      } catch (error) {
        toolsCalled.push({ name: call.name, ok: false });
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Tool error: ${error instanceof Error ? error.message : String(error)}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return escalateInternal(
    "other",
    "agent_protocol_failure",
    "The resolution agent did not reach a terminal state within its turn budget. A human needs to pick this up.",
  );
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function outcomeFromTerminalCall(
  name: string,
  input: Record<string, unknown>,
  confidenceThreshold: number,
): AgentOutcome {
  if (name === "send_reply") {
    const body = String(input.body ?? "").trim();
    const confidence = clamp01(Number(input.confidence ?? 0));
    const language = typeof input.language === "string" ? input.language : null;
    const kind = input.outcome === "clarifying_question" ? "clarified" : "answered";

    if (!body) {
      return {
        kind: "escalated",
        category: "other",
        reason: "empty_reply",
        diagnosis: "The agent attempted to send an empty reply.",
        stepsTried: [],
        suggestedReply: "",
        holdingReply: null,
      };
    }

    if (violatesCommercialGuardrail(body)) {
      return {
        kind: "escalated",
        category: "commercial_or_billing",
        reason: "outbound_guardrail",
        diagnosis:
          "The drafted reply contained a commercial commitment (refund/credit/discount), which the AI must never send. The draft is attached for a human to review.",
        stepsTried: [],
        suggestedReply: body,
        holdingReply: null,
      };
    }

    if (kind === "answered" && confidence < confidenceThreshold) {
      return {
        kind: "escalated",
        category: "low_confidence",
        reason: `confidence ${confidence.toFixed(2)} below threshold ${confidenceThreshold}`,
        diagnosis:
          "The agent drafted an answer but its own confidence is below the configured threshold, so it is escalating instead of sending. The draft is attached.",
        stepsTried: [],
        suggestedReply: body,
        holdingReply: null,
      };
    }

    return { kind, reply: body, confidence, language };
  }

  // escalate tool
  const rawCategory = String(input.category ?? "other") as EscalationCategory;
  const category = ESCALATION_CATEGORIES.includes(rawCategory) ? rawCategory : "other";
  const holding = typeof input.holding_reply === "string" && input.holding_reply.trim() ? input.holding_reply.trim() : null;
  return {
    kind: "escalated",
    category,
    reason: category,
    diagnosis: String(input.diagnosis ?? "").trim(),
    stepsTried: Array.isArray(input.steps_tried) ? input.steps_tried.map(String) : [],
    suggestedReply: String(input.suggested_reply ?? "").trim(),
    holdingReply: holding,
  };
}
