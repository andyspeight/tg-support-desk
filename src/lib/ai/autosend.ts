import type { AgentOutcome } from "./types";

// Graduated autonomy: is this reply cleared to send itself? Never in shadow mode,
// and never below the confidence bar. Beyond that we split by outcome:
//  - A clarifying question is low-risk — it asks for information, it doesn't
//    assert a fact or make a commitment, and commercial/legal/human-request
//    topics never reach here (the mandatory-escalation guardrail runs first). So
//    auto-send any confident clarification regardless of intent or grounding.
//  - A definitive answer is higher-stakes (it could be wrong or ungrounded), so
//    it must clear two more bars: a KB-answerable, low-risk intent on the
//    allowlist AND grounding — at least one KB article was retrieved to base it
//    on. If search_kb found nothing, the answer is the model's own unverified
//    knowledge, so we hold it for a human. This is the pre-send complement to the
//    QA judge's after-the-fact grounding check: it stops a confidently-wrong,
//    unsourced answer reaching the client in the first place.
// Escalations never auto-send here. Pure (config passed in) so it's unit-testable
// without pulling in the server-only env module.
export function canAutoSend(
  outcome: AgentOutcome,
  cfg: { shadowMode: boolean; confidenceBar: number; allowedIntents: string[]; intent: string | null; grounded: boolean },
): boolean {
  if (cfg.shadowMode) return false;
  if (outcome.kind !== "answered" && outcome.kind !== "clarified") return false;
  if (outcome.confidence < cfg.confidenceBar) return false;
  if (outcome.kind === "clarified") return true;
  if (!cfg.grounded) return false;
  return Boolean(cfg.intent && cfg.allowedIntents.includes(cfg.intent));
}
