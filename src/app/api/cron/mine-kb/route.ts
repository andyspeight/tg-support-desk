import { requireCron } from "@/lib/cron-auth";
import { audit, createKbArticle, existingKbSourceTicketIds, listHumanResolvedEscalated } from "@/lib/db/queries";
import { copilotDraftKbArticle } from "@/lib/ai/copilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Self-improvement loop: turn recent human-resolved escalations into KB article
// candidates (status 'review'). Bounded per run to cap cost; skips tickets that
// already produced a candidate. Self-contained (Anthropic + Supabase).
const PER_RUN = Number(process.env.KB_MINE_PER_RUN ?? "5");
const WINDOW_HOURS = Number(process.env.KB_MINE_WINDOW_HOURS ?? "48");

export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;

  try {
    const resolved = await listHumanResolvedEscalated(WINDOW_HOURS, 50);
    if (resolved.length === 0) return Response.json({ drafted: 0, candidates: 0 });

    const already = await existingKbSourceTicketIds(resolved.map((t) => t.id));
    const todo = resolved.filter((t) => !already.has(t.id)).slice(0, PER_RUN);

    let drafted = 0;
    const errors: string[] = [];
    for (const ticket of todo) {
      try {
        const { title, body } = await copilotDraftKbArticle(ticket.id);
        await createKbArticle({
          title,
          body,
          status: "review",
          source: "ticket_mined",
          source_ticket_id: ticket.id,
          created_by: "self-improvement",
        });
        await audit("ai", "self-improvement", "kb.mined", { type: "ticket", id: ticket.id });
        drafted++;
      } catch (err) {
        errors.push(`${ticket.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length) console.error("mine-kb errors:", errors);
    return Response.json({ drafted, candidates: todo.length, errors: errors.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("mine-kb failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
