"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { audit, bulkUpdateTickets } from "@/lib/db/queries";
import { notify } from "@/lib/db/notifications";
import { env } from "@/lib/env";

const bulkSchema = z.object({
  ids: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
  op: z.enum(["assign_me", "unassign", "assign", "status", "tag"]),
  value: z.string().optional(),
});

const STATUSES = ["new", "ai_working", "waiting_on_customer", "escalated", "resolved", "closed"] as const;

export async function bulkUpdateTicketsAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { ids, op, value } = bulkSchema.parse(Object.fromEntries(formData));

  if (op === "assign_me") {
    await bulkUpdateTickets(ids, { assignee: session.email });
  } else if (op === "unassign") {
    await bulkUpdateTickets(ids, { assignee: null });
  } else if (op === "assign") {
    const assignee = (value ?? "").trim().toLowerCase();
    if (!assignee || !env.agentEmails.includes(assignee)) throw new Error("Unknown assignee");
    await bulkUpdateTickets(ids, { assignee });
    await notify({
      recipients: [assignee],
      skip: session.email,
      type: "assigned",
      ticketId: ids.length === 1 ? ids[0] : null,
      title: ids.length === 1 ? "You were assigned a ticket" : `You were assigned ${ids.length} tickets`,
      actor: session.email,
    });
  } else if (op === "status") {
    const status = z.enum(STATUSES).parse(value);
    const patch: Parameters<typeof bulkUpdateTickets>[1] = { status };
    if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();
    await bulkUpdateTickets(ids, patch);
  } else if (op === "tag") {
    const tag = (value ?? "").trim().toLowerCase();
    if (tag) await bulkUpdateTickets(ids, { addTag: tag });
  }

  await audit("human", session.email, "ticket.bulk_update", undefined, { op, value: value ?? null, count: ids.length });
  revalidatePath("/inbox");
}
