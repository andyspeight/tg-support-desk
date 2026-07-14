import "server-only";
import {
  addMessage,
  audit,
  getKbSourcesForTicket,
  getTicketWithMessages,
  insertQaReview,
  listAiRepliesForQa,
  updateTicket,
} from "@/lib/db/queries";
import { notify, ticketRecipients } from "@/lib/db/notifications";
import { env } from "@/lib/env";
import type { Json } from "@/lib/db/database.types";
import type { Ticket } from "@/lib/db/types";
import { qaJudgeReply, type QaVerdict } from "./qa-judge";

const BATCH = 8;

/**
 * Grade a batch of un-reviewed AI-sent replies. Records a verdict per reply and,
 * on a flag, surfaces it to the team (internal note + tag + alert), reopening a
 * closed ticket only for a serious breach (commercial commitment or an
 * unverified factual claim) so a human can correct it with the client.
 */
export async function runQaReviews(): Promise<{ reviewed: number; flagged: number }> {
  const replies = await listAiRepliesForQa(BATCH);
  let reviewed = 0;
  let flagged = 0;

  for (const reply of replies) {
    const loaded = await getTicketWithMessages(reply.ticket_id);
    if (!loaded) continue;

    // The customer message this reply answered = the latest customer message at
    // or before the reply.
    const question =
      [...loaded.messages]
        .filter((m) => m.role === "customer" && new Date(m.created_at) <= new Date(reply.created_at))
        .pop()?.body_text ?? loaded.ticket.subject;

    // The KB the AI was allowed to draw on — lets the judge fact-check claims
    // against the actual sources rather than guessing at plausibility. Best-effort.
    let sources = "";
    try {
      const kb = await getKbSourcesForTicket(reply.ticket_id);
      sources = kb.map((a) => `## ${a.title}\n${a.body.slice(0, 1800)}`).join("\n\n");
    } catch (error) {
      console.error("getKbSourcesForTicket failed:", error);
    }

    let verdict: QaVerdict;
    try {
      verdict = await qaJudgeReply({ subject: loaded.ticket.subject, question, reply: reply.body_text, sources });
    } catch (error) {
      // Leave it un-reviewed so the next run retries; don't record a false pass.
      console.error("qaJudgeReply failed:", error);
      continue;
    }

    await insertQaReview({
      ticket_id: reply.ticket_id,
      message_id: reply.message_id,
      verdict: verdict.verdict,
      commercial_commitment: verdict.commercialCommitment,
      on_brand: verdict.onBrand,
      addresses_question: verdict.addressesQuestion,
      grounded: verdict.grounded,
      issues: verdict.issues as unknown as Json,
      note: verdict.note || null,
      model: env.utilityModel,
    });
    reviewed += 1;

    if (verdict.verdict === "flag") {
      flagged += 1;
      await flagTicket(loaded.ticket, verdict);
    }
  }

  return { reviewed, flagged };
}

async function flagTicket(ticket: Ticket, verdict: QaVerdict): Promise<void> {
  const serious = verdict.commercialCommitment || !verdict.grounded;
  const body = [
    "QA FLAG — the AI's auto-sent reply needs a human check.",
    verdict.note ? `\n${verdict.note}` : "",
    verdict.issues.length ? `\nIssues:\n${verdict.issues.map((i) => `- ${i}`).join("\n")}` : "",
    `\n\nChecks — commercial commitment: ${verdict.commercialCommitment ? "FAIL" : "ok"} · grounded: ${verdict.grounded ? "ok" : "FAIL"} · answered: ${verdict.addressesQuestion ? "ok" : "FAIL"} · on-brand: ${verdict.onBrand ? "ok" : "FAIL"}`,
  ].join("");

  await addMessage({
    ticket_id: ticket.id,
    role: "internal_note",
    author: "qa-judge",
    body_text: body,
    channel_meta: { kind: "qa_flag" },
  });

  const patch: Parameters<typeof updateTicket>[1] = {
    tags: ticket.tags.includes("qa-flagged") ? ticket.tags : [...ticket.tags, "qa-flagged"],
  };
  // A serious breach that already went out on a closed/resolved ticket → reopen
  // to Needs review so a human corrects it with the client.
  if (serious && (ticket.status === "closed" || ticket.status === "resolved")) {
    patch.status = "needs_review";
    patch.ai_resolved = false;
    patch.resolved_at = null;
  }
  await updateTicket(ticket.id, patch);

  await audit("system", "qa-judge", "qa.flagged", { type: "ticket", id: ticket.id }, {
    commercial_commitment: verdict.commercialCommitment,
    grounded: verdict.grounded,
    addresses_question: verdict.addressesQuestion,
    on_brand: verdict.onBrand,
  });

  const owners = ticketRecipients(ticket);
  await notify({
    recipients: owners.length > 0 ? owners : env.agentEmails,
    type: "needs_review",
    ticketId: ticket.id,
    title: `QA flag on #${ticket.reference} — check the AI's reply`,
    body: verdict.note || verdict.issues[0] || undefined,
    actor: "qa-judge",
  });
}
