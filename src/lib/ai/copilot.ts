import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { getTicketWithMessages } from "@/lib/db/queries";
import { searchKb } from "./kb-search";
import { reversesStance } from "./rewrite-guard";

// Agent copilot: drafting and rewriting help for the human side. Grounded in
// the same KB as the resolution agent, in Travelgenix brand voice. These
// assist an agent — they never auto-send.

const BRAND_VOICE =
  "Travelgenix brand voice: warm, plain, professional UK English. Sound like a knowledgeable colleague, not a bot — no 'I hope this finds you well', no 'we sincerely apologise for any inconvenience', no exclamation-mark enthusiasm. Short paragraphs, specific, plain text only.";

async function complete(model: string, system: string, prompt: string, maxTokens = 1500): Promise<string> {
  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 30000 });
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

/** Run the copilot model, falling back to the utility model if the upgraded
 *  model errors (e.g. it isn't enabled on the account yet). Keeps the tool
 *  working — on the previous model — instead of failing outright. */
async function completeCopilot(system: string, prompt: string, maxTokens = 1500): Promise<string> {
  try {
    return await complete(env.copilotModel, system, prompt, maxTokens);
  } catch (error) {
    if (env.copilotModel === env.utilityModel) throw error;
    console.error(`copilot model ${env.copilotModel} failed; falling back to ${env.utilityModel}:`, error);
    return complete(env.utilityModel, system, prompt, maxTokens);
  }
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

  const system = `You are drafting a support reply for a Travelgenix agent to review and edit before sending. ${BRAND_VOICE} Ground factual claims in the knowledge base provided; if the KB doesn't cover it, write what you safely can and leave a [bracketed note] where the agent must confirm details. Never promise refunds, credits, discounts or contract changes.
Acknowledge, never commit: don't promise an outcome ("we'll fix it", "we'll get that added"), a timeframe ("shortly", "as soon as possible", "within 24 hours"), what a colleague will do ("the team will get back to you"), or any guarantee. State what's true — what was checked, what was found, where the ticket sits. The agent can add a commitment themselves if they choose to make one. Open with the customer's first name and end with your closing sentence — do NOT add a sign-off line, as the sending agent's name is appended automatically.`;
  const prompt = `Knowledge base:\n${kb || "(no relevant articles found)"}\n\nConversation so far:\n${threadText(loaded.messages)}\n\nDraft the next reply to the customer.`;
  return complete(env.resolutionModel, system, prompt);
}

/**
 * Draft a PROACTIVE outreach message about a supplier/integration issue, for a
 * human to review before it goes to affected clients. Honest and reassuring,
 * grounded only in what the incident states (no invented cause/ETA), and never
 * any commercial commitment. Uses a {{name}} token personalised per client on send.
 */
export async function draftOutreach(incident: {
  supplier: string;
  summary: string;
  detail?: string | null;
}): Promise<string> {
  const system = `You are drafting a PROACTIVE outreach message Travelgenix is sending to affected clients about a supplier/integration issue — before they have raised a ticket. A human reviews it before it sends. ${BRAND_VOICE}
Reassure the client we have spotted the issue and are on it, say plainly what is affected and what (if anything) they need to do, and that we will update them. Be specific but do NOT invent anything beyond what you are told — if you do not know the cause or an ETA, do not state one. Never promise refunds, credit, compensation or contract changes.
Begin with exactly "Hi {{name}}," on its own line (personalised per client on send) and end with "Travelgenix Support" on its own line. Plain text only, no subject line, a few short paragraphs.`;
  const detail = incident.detail?.trim() ? `\n\nWhat we know:\n${incident.detail.trim()}` : "";
  const prompt = `Supplier / system affected: ${incident.supplier}\nIssue: ${incident.summary}${detail}\n\nDraft the outreach message.`;
  return complete(env.resolutionModel, system, prompt, 700);
}

/** One-paragraph summary of the whole thread for fast triage. */
export async function copilotSummarise(ticketId: string): Promise<string> {
  const loaded = await getTicketWithMessages(ticketId);
  if (!loaded) throw new Error("ticket not found");
  const system =
    "Summarise this support ticket for an agent picking it up cold: the customer's issue, what's been tried, and what's outstanding. One tight paragraph, plain UK English, no preamble.";
  return complete(env.utilityModel, system, threadText(loaded.messages), 500);
}

/** Rewrite agent-supplied text into brand voice — WORDING ONLY, never the
 *  substance. It polishes how the reply reads; it must not change what it says. */
export async function copilotRephrase(text: string): Promise<string> {
  const system = `You polish a support agent's draft reply. Rewrite ONLY the wording — warmth, clarity, professionalism — into ${BRAND_VOICE}
Preserve the agent's message exactly: the same answer, the same decision, the same stance. These are hard rules you must never break:
- Never reverse the meaning. A "no" stays a no; "we can't" / "we won't" / "that's not possible" stay refusals. Never turn a refusal into an acceptance or a maybe.
- Never add anything the agent didn't write — no new offers, promises, next steps, apologies, or requests for information.
- You are NOT answering the customer. You are only re-wording what the agent wrote.
- If the draft is short (e.g. "No, we can't do that"), keep it short — make it polite, not longer or different in substance.
Return only the rewritten text, nothing else.`;
  const out = await completeCopilot(system, text);
  // Safety net: if the rewrite dropped the refusal (a likely "no" → "yes"
  // flip), keep the agent's own words rather than hand back a reversal.
  return reversesStance(text, out) ? text.trim() : out;
}

/** Fix spelling, grammar and punctuation only — UK English — without touching
 *  meaning, facts, names, links, tone or formatting. A clean final pass. */
export async function copilotProofread(text: string): Promise<string> {
  const system =
    "You are a proofreader. Correct only spelling, grammar and punctuation in the agent's message, using UK English " +
    "(e.g. organise, colour, apologise). Do NOT change the meaning, facts, names, URLs, tone or formatting, and do not " +
    "add, remove or reword content beyond fixing errors. If it is already correct, return it unchanged. Return only the corrected text.";
  return complete(env.utilityModel, system, text);
}

/** Translate text into the target language, preserving meaning and tone. */
export async function copilotTranslate(text: string, targetLanguage: string): Promise<string> {
  const system = `Translate the text into ${targetLanguage}. Preserve meaning, tone and formatting. Return only the translation.`;
  return completeCopilot(system, text);
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

  const system = `You quality-check a support reply a Travelgenix agent is about to send, for TONE ONLY. Busy agents can be blunt or curt; your job is to catch a reply that would read as rude, cold, dismissive or abrupt and offer a warmer wording of THE SAME MESSAGE. ${BRAND_VOICE}
These are hard rules you must never break:
- Preserve the agent's answer, decision and stance exactly. A "no" stays a firm no; "we can't do that" stays a refusal. Never reverse the meaning, never soften a decision into a maybe or a yes.
- Never add offers, promises, next steps, requests for information, or any fact the agent did not write. Warmer wording only — not more content.
- A polite refusal, or a short answer, is NOT a problem. Only flag genuine rudeness, coldness or abruptness. If the draft is civil, return "ok".
Respond with ONLY minified JSON: {"verdict":"ok"|"revise","issues":["short issue"],"rewrite":"the same reply, reworded warmer"}.
Use "ok" when the draft is already civil and on-voice (issues [], rewrite ""). Use "revise" ONLY for rudeness, coldness or abruptness: give 1-3 short issues and a rewrite that keeps the agent's exact answer and every fact, link and specific — changing wording only.`;
  const prompt = `Customer's latest message:\n${question || "(unavailable — judge tone only)"}\n\nAgent's draft reply:\n${text}`;
  const review = parseReview(await completeCopilot(system, prompt, 1200));
  // Safety net: never surface a rewrite that flipped the agent's refusal into
  // an acceptance — drop it and let the agent send their own words.
  if (review.rewrite && reversesStance(text, review.rewrite)) {
    return { verdict: "ok", issues: [], rewrite: "" };
  }
  return review;
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

export type DraftAssist = { suggestions: string[]; article: { title: string; url: string } | null };

/** Pre-submit assist for the contact form / new-ticket flow. Purely advisory —
 *  it never blocks a submission. Returns (1) a KB article that might already
 *  solve it, and (2) up to three concrete details that would make the request
 *  actionable. Fail-open: any error yields empty guidance, so a hiccup can never
 *  trap the user. */
export async function assistTicketDraft(subject: string, body: string): Promise<DraftAssist> {
  const subjectClean = subject.trim().slice(0, 200);
  const bodyClean = body.trim().slice(0, 4000);
  if (bodyClean.length < 15) return { suggestions: [], article: null };

  // (1) Article suggestion — top published KB match that has a public link.
  let article: DraftAssist["article"] = null;
  try {
    const matches = await searchKb(`${subjectClean}\n${bodyClean}`, 4);
    const hit = matches.find((m) => m.source_url);
    if (hit) article = { title: hit.title, url: hit.source_url as string };
  } catch {
    // KB/embeddings unavailable — simply no article suggestion.
  }

  // (2) Detail sufficiency — utility model, strict JSON, fail-open.
  let suggestions: string[] = [];
  try {
    const system = `A Travelgenix client is about to send a support request. Judge whether it gives the team enough to investigate without a back-and-forth. ${BRAND_VOICE}
Respond with ONLY minified JSON: {"enough":true|false,"missing":["short specific item"]}.
When it's not enough, list up to 3 concrete things that would help — e.g. the page URL (for a search, results, extras or basket issue this must be the page URL carrying the search Session ID, i.e. the part after "searchSession="), the exact error text, what they expected to happen, the affected widget/booking reference, or a screenshot. Be generous: if it's already clear, return {"enough":true,"missing":[]}. Never ask for refunds, billing or contract details.`;
    const prompt = `Subject: ${subjectClean || "(none)"}\n\nMessage: ${bodyClean}`;
    const raw = await complete(env.utilityModel, system, prompt, 300);
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const p = JSON.parse(json) as { enough?: boolean; missing?: unknown };
    if (p.enough === false && Array.isArray(p.missing)) {
      suggestions = p.missing.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3);
    }
  } catch {
    // fail-open — no suggestions
  }

  return { suggestions, article };
}
