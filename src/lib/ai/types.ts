// Pure types shared by the agent loop, the production wiring and the eval
// harness. No server-only imports here.

export type EscalationCategory =
  | "human_requested"
  | "commercial_or_billing"
  | "legal"
  | "missing_knowledge"
  | "tool_error"
  | "low_confidence"
  | "complex_or_risky"
  | "other";

// Every agent run ends in exactly one of the brief's four terminal states.
// (Phase 1 has no action tools, so "action taken + verified" arrives in Phase 3.)
export type AgentOutcome =
  | { kind: "answered"; reply: string; confidence: number; language: string | null }
  | { kind: "clarified"; reply: string; confidence: number; language: string | null }
  | {
      kind: "escalated";
      category: EscalationCategory;
      reason: string;
      diagnosis: string;
      stepsTried: string[];
      suggestedReply: string;
      holdingReply: string | null;
    };

export type ToolCallRecord = { name: string; ok: boolean };

export type ToolExecutor = (input: Record<string, unknown>) => Promise<string>;
export type ToolExecutors = Record<string, ToolExecutor>;

export type AgentConfig = {
  apiKey: string;
  model: string;
  maxTurns: number;
  confidenceThreshold: number;
};

export type TranscriptEntry = {
  role: "customer" | "ai" | "human" | "internal_note";
  body: string;
};

export type TicketContext = {
  subject: string;
  requesterName: string | null;
  requesterEmail: string;
  /** One-line client match status; full record comes via get_client_context. */
  clientLine: string;
  /** This requester has an earlier ticket on record — greet them as a returning
   *  contact rather than a first-timer. */
  returningContact: boolean;
  transcript: TranscriptEntry[];
};

export type AgentRunResult = {
  outcome: AgentOutcome;
  toolsCalled: ToolCallRecord[];
  turns: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
};
