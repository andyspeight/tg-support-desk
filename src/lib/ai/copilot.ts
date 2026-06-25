import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { getTicketWithMessages } from "@/lib/db/queries";
import { searchKb } from "./kb-search";

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
    const matches = await searchKb(query, 4);
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

export type ReplyReview = { verdict: "ok" | "revise"; issues: string[]; rewrite: string };

function parseReview(raw: string): ReplyReview {
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const p = JSON.parse(json) as Partial<ReplyReview>;
    return {
      verdict: p.verdict === "revise" ? "revise" : "ok",
      issues: Array.isArray(p.issues) ? p.issues.filter((s): s is string => typeof s === "string").slice(0, 5) : [],
      rewrite: typeof p.rewrite === "string" ? p.rewrite : "",
    };
  } catch {
    return { verdict: "ok", issues: [], rewrite: "" }; // fail-open — never block a send
  }
}

/**
 * Pre-send quality gate. Busy agents can be terse to the point of cold; this
 * reads the draft against the customer's latest message and, if it's
 * curt/blunt/incomplete or off-voice, returns issues + a warmer rewrite.
 * Fail-open by design: any problem yields verdict "ok" so the agent is never
 * trapped by an AI hiccup.
 */
export async function copilotReview(ticketId: string, text: string): Promise<ReplyReview> {
  let question = "";
  try {
    const loaded = await getTicketWithMessages(ticketId);
    const latestCustomer = loaded ? [...loaded.messages].reverse().find((m) => m.role === "customer") : null;
    question = latestCustomer?.body_text?.slice(0, 3000) ?? "";
  } catch {
    // Thread unavailable — fall back to a tone-only review.
  }

  const system = `You quality-check a support reply a Travelgenix agent is about to send. Busy agents are often too curt, blunt or brief. Judge the draft on: tone (warm and human, never abrupt or dismissive), whether it actually addresses the customer's message, and ${BRAND_VOICE}
Respond with ONLY minified JSON: {"verdict":"ok"|"revise","issues":["short issue"],"rewrite":"full improved reply"}.
Use "ok" when the draft is already warm, clear and complete (issues [], rewrite ""). Use "revise" when it is curt, cold, incomplete or off-voice: give 1-3 short specific issues and a full rewrite that keeps EVERY fact, link and specific the agent wrote — improve only tone, clarity and completeness. Never add facts, promises, refunds, credits or commitments the agent did not make.`;
  const prompt = `Customer's latest message:\n${question || "(unavailable — judge tone and clarity only)"}\n\nAgent's draft reply:\n${text}`;
  return parseReview(await complete(env.utilityModel, system, prompt, 1200));
}

/** Self-improvement loop: turn a resolved ticket into a reusable KB article
 *  candidate (review queue). Generalised + PII-stripped, brand voice. */
export async function copilotDraftKbArticle(ticketId: string): Promise<{ title: string; body: string }> {
  const loaded = await getTicketWithMessages(ticketId);
  if (!loaded) throw new Error("ticket not found");

  const system = `You turn a resolved support ticket into a reusable knowledge-base article for a Travelgenix agent or AI to reuse on similar issues. ${BRAND_VOICE}
Generalise away from this one customer: NO names, emails, booking/order references or other PII. Capture the problem and the working resolution as a clear how-to. Where a step depends on a specific that won't generalise, write a [bracketed placeholder]. Never invent anything the conversation doesn't support.
Respond with ONLY minified JSON: {"title":"concise question-shaped title","body":"the article in plain text"}.`;
  const raw = await complete(env.resolutionModel, system, threadText(loaded.messages), 1500);

  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const p = JSON.parse(json) as { title?: string; body?: string };
    const title = (p.title ?? "").trim();
    const body = (p.body ?? "").trim();
    if (!title || !body) throw new Error("empty draft");
    return { title: title.slice(0, 300), body: body.slice(0, 20000) };
  } catch (error) {
    throw new Error(`copilotDraftKbArticle: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Distil a crawled page (e.g. a University lesson) into a clean KB article.
 *  Plain TITLE/body format, not JSON: long lesson bodies (quotes, newlines,
 *  braces) routinely broke JSON.parse, which failed the page and cost a
 *  re-scrape on every retry. The fallback keeps a non-conforming reply usable. */
export async function distilKbFromPage(markdown: string, hintTitle: string | null): Promise<{ title: string; body: string }> {
  const system = `You turn a Travelgenix University lesson (a how-to article) into a clean knowledge-base entry the support AI and agents can reuse. ${BRAND_VOICE}
Stay accurate to the source — do not invent. Strip navigation, marketing fluff, cookie notices and boilerplate; keep the substance as a focused how-to. Where a detail clearly won't generalise, leave a [bracketed placeholder].
Respond in EXACTLY this format and nothing else:
TITLE: <a concise, question-shaped title on one line>

<the article body in plain text>`;
  const prompt = `${hintTitle ? `Lesson title: ${hintTitle}\n\n` : ""}Lesson content (markdown):\n${markdown.slice(0, 24000)}`;
  const raw = (await complete(env.resolutionModel, system, prompt, 2000)).trim();

  const match = raw.match(/^TITLE:[ \t]*(.+?)[ \t]*\n([\s\S]*)$/);
  const title = (match ? match[1] : hintTitle ?? "").trim();
  const body = (match ? match[2] : raw).trim();
  if (!title || !body) throw new Error("distilKbFromPage: empty distillation");
  return { title: title.slice(0, 300), body: body.slice(0, 20000) };
}

export type AskResult = { answer: string; sources: { title: string; url: string }[] };

/** Instant self-serve answer for the client portal — grounded in the published
 *  KB, with "read more" links to the source lessons. No ticket, no email, no
 *  shadow gating: this never acts, it only answers what the KB supports. */
export async function askKb(question: string): Promise<AskResult> {
  const q = question.trim().slice(0, 1000);
  if (!q) return { answer: "Ask a question about using Travelgenix and I'll help if I can.", sources: [] };

  let matches: Awaited<ReturnType<typeof searchKb>> = [];
  try {
    matches = await searchKb(q, 5);
  } catch {
    // KB/embeddings unavailable — fall through to the raise-a-ticket nudge.
  }
  if (matches.length === 0) {
    return {
      answer: "I couldn't find an answer to that in our help content. If you raise a ticket, the team will pick it up.",
      sources: [],
    };
  }

  const kb = matches.map((m) => `## ${m.title}\n${m.body.slice(0, 1800)}`).join("\n\n");
  const system = `You answer Travelgenix clients' questions in the self-serve help box. ${BRAND_VOICE}
Answer ONLY from the knowledge base provided, in two to four sentences that directly solve the question. If the knowledge base doesn't actually answer it, say you're not sure and suggest raising a ticket — never guess. Never discuss refunds, credits, discounts or contract/billing changes; say the team will help with those. Do not add links or a sign-off — just the answer.`;
  const prompt = `Knowledge base:\n${kb}\n\nClient question: ${q}\n\nAnswer the client.`;

  let answer: string;
  try {
    answer = (await complete(env.resolutionModel, system, prompt, 700)).trim();
  } catch {
    // The assistant model is unreachable — still hand back the matched articles
    // (below) so the client isn't stuck, and nudge a ticket. Never throws.
    answer =
      "I couldn't generate an answer just now, but the help articles below look relevant. If they don't solve it, raise a ticket and the team will help.";
  }

  const sources = matches
    .filter((m) => m.source_url)
    .slice(0, 3)
    .map((m) => ({ title: m.title, url: m.source_url as string }));
  return { answer, sources };
}
