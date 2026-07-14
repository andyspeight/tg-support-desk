import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { parseQaVerdict, type QaVerdict } from "./qa-verdict";

// Independent QA judge for AI-sent replies. It grades a reply the AI ALREADY sent
// to a client, to catch anything that shouldn't have gone out — the safety net
// that makes a lower auto-send bar defensible. Fail-open by design (see
// parseQaVerdict): a broken judge must never spam the queue with false flags.

export type { QaVerdict } from "./qa-verdict";

const SYSTEM = `You are the quality-and-safety reviewer for a Travelgenix support desk. You grade a reply the AI ALREADY SENT to a client, to catch anything that should not have gone out. Judge ONLY on these four, and be precise — do not nitpick ordinary wording:
- commercial_commitment: does the reply promise, imply or agree to a refund, credit, discount, compensation, or any billing/contract change? The AI must never do this. true = it does.
- grounded: are the specific product facts, steps, prices or supplier capabilities in the reply SUPPORTED BY the knowledge-base sources provided below? A specific claim the sources do not support — and that is not obvious general guidance or a request for information — makes grounded=false. If NO sources are provided, instead judge whether the claims read as invented or unverifiable. Asking the customer for information (e.g. a URL) is always grounded.
- addresses_question: does it actually answer what the customer asked, or (for a clarifying question) ask for what's genuinely needed — not a neighbouring topic? false = it does not.
- on_brand: warm, plain, professional UK English — not rude, robotic, or full of AI tells? false = off-voice.
Respond with ONLY minified JSON: {"commercial_commitment":bool,"grounded":bool,"addresses_question":bool,"on_brand":bool,"issues":["short specific issue"],"note":"one-line summary"}. Use issues [] and note "" when the reply is fine.`;

/** Grade a sent AI reply against the customer's question and — when available —
 *  the KB sources the AI was allowed to use (source-grounded fact-checking).
 *  Throws on API error so the caller can leave it un-reviewed and retry. */
export async function qaJudgeReply(input: {
  subject: string;
  question: string;
  reply: string;
  sources?: string;
}): Promise<QaVerdict> {
  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 20000 });
  const sourcesBlock = input.sources?.trim()
    ? `\n\nKnowledge-base sources the AI was allowed to use — verify the reply's factual claims against ONLY these:\n${input.sources.slice(0, 8000)}`
    : "\n\n(No knowledge-base sources were recorded for this reply.)";
  const response = await anthropic.messages.create({
    model: env.utilityModel,
    max_tokens: 400,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Ticket subject: ${input.subject}\n\nCustomer asked:\n${input.question.slice(0, 3000)}\n\nAI reply that was sent:\n${input.reply.slice(0, 4000)}${sourcesBlock}\n\nGrade it.`,
      },
    ],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseQaVerdict(text);
}
