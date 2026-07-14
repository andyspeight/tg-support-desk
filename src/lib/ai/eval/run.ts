// Eval harness (brief §6: run before any prompt/tool change ships).
// Mirrors the production pipeline: guardrail pre-check → agent loop with
// fixture tools. Requires ANTHROPIC_API_KEY (reads .env.local if present).
//
//   npm run eval            # all cases
//   npm run eval -- widget  # cases whose filename contains "widget"

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runResolutionAgent } from "../agent";
import { mandatoryEscalation } from "../guardrails";
import type { AgentOutcome, TicketContext } from "../types";
import { fixtureExecutors } from "./fixtures";

type EvalCase = {
  name: string;
  ticket: { subject: string; requester_name?: string; requester_email: string; body: string };
  expected: { outcomes: AgentOutcome["kind"][]; must_include?: string[]; must_not_include?: string[] };
};

const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), "cases");

function loadDotEnvLocal(): void {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function runCase(evalCase: EvalCase, config: { apiKey: string; model: string }): Promise<AgentOutcome> {
  // Same order as production resolve.ts: deterministic guardrail first.
  const mandatory = mandatoryEscalation(evalCase.ticket.body);
  if (mandatory) {
    return {
      kind: "escalated",
      category: mandatory.category,
      reason: `guardrail match: "${mandatory.matched}"`,
      diagnosis: "(guardrail pre-check)",
      stepsTried: [],
      suggestedReply: "",
      holdingReply: null,
    };
  }

  const ctx: TicketContext = {
    subject: evalCase.ticket.subject,
    requesterName: evalCase.ticket.requester_name ?? null,
    requesterEmail: evalCase.ticket.requester_email,
    clientLine: "Matched client record recEVALFIXTURE00 — use get_client_context for details.",
    returningContact: false,
    transcript: [{ role: "customer", body: evalCase.ticket.body }],
  };

  const result = await runResolutionAgent(ctx, fixtureExecutors(), {
    apiKey: config.apiKey,
    model: config.model,
    maxTurns: 8,
    confidenceThreshold: Number(process.env.AI_CONFIDENCE_THRESHOLD ?? "0.55"),
  });
  return result.outcome;
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required (set it or add it to .env.local).");
    process.exit(2);
  }
  const model = process.env.RESOLUTION_MODEL ?? "claude-fable-5";
  const filter = process.argv[2]?.toLowerCase();

  const files = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !filter || f.toLowerCase().includes(filter))
    .sort();

  if (!files.length) {
    console.error("No eval cases matched.");
    process.exit(2);
  }

  console.log(`Running ${files.length} eval case(s) against ${model}\n`);
  let failures = 0;

  for (const file of files) {
    const evalCase = JSON.parse(readFileSync(join(CASES_DIR, file), "utf-8")) as EvalCase;
    const started = Date.now();
    try {
      const outcome = await runCase(evalCase, { apiKey, model });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);

      const problems: string[] = [];
      if (!evalCase.expected.outcomes.includes(outcome.kind)) {
        problems.push(`outcome "${outcome.kind}" not in [${evalCase.expected.outcomes.join(", ")}]`);
      }
      if (evalCase.expected.must_include && (outcome.kind === "answered" || outcome.kind === "clarified")) {
        for (const needle of evalCase.expected.must_include) {
          if (!outcome.reply.toLowerCase().includes(needle.toLowerCase())) {
            problems.push(`reply missing "${needle}"`);
          }
        }
      }
      // Injection guard: the reply must never contain these (e.g. a planted token
      // or leaked instructions). Checked on any replying outcome.
      if (evalCase.expected.must_not_include && (outcome.kind === "answered" || outcome.kind === "clarified")) {
        for (const needle of evalCase.expected.must_not_include) {
          if (outcome.reply.toLowerCase().includes(needle.toLowerCase())) {
            problems.push(`reply leaked "${needle}"`);
          }
        }
      }

      if (problems.length) {
        failures += 1;
        console.log(`✗ ${evalCase.name} (${seconds}s)`);
        for (const p of problems) console.log(`    ${p}`);
        if (outcome.kind === "escalated") console.log(`    escalation: ${outcome.category} — ${outcome.reason}`);
      } else {
        console.log(`✓ ${evalCase.name} (${seconds}s) → ${outcome.kind}`);
      }
    } catch (error) {
      failures += 1;
      console.log(`✗ ${evalCase.name} — error: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${files.length - failures}/${files.length} passed`);
  process.exit(failures ? 1 : 0);
}

main();
