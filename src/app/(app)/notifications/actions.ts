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
});

/** Mark one notification read, then jump to its ticket (if any). */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const { id, ticketId } = openSchema.parse(Object.fromEntries(formData));
  await markRead(id, session.email).catch(() => {});
  revalidatePath("/notifications");
  redirect(ticketId ? `/ticket/${ticketId}` : "/notifications");
}
