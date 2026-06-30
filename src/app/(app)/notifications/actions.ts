"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { markAllRead, markRead } from "@/lib/db/notifications";

export async function markAllReadAction(): Promise<void> {
  const session = await requireAgent();
  await markAllRead(session.email);
  revalidatePath("/notifications");
}

const openSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid().optional().or(z.literal("")),
  type: z.string().optional(),
});

/** Mark one notification read, then jump where it points: the ticket if it has
 *  one, the Pending approval queue for the (ticket-less) approval nudge, else
 *  back to the list. */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { id, ticketId, type } = openSchema.parse(Object.fromEntries(formData));
  await markRead(id, session.email).catch(() => {});
  revalidatePath("/notifications");
  const dest = ticketId
    ? `/ticket/${ticketId}`
    : type === "pending_approval"
      ? "/inbox?view=approval"
      : "/notifications";
  redirect(dest);
}
