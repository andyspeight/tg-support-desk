"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyCsatToken } from "@/lib/csat";
import { recordCsat } from "@/lib/db/queries";
import { env } from "@/lib/env";

const schema = z.object({
  t: z.string().min(1),
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

// Public — no SSO. Authorisation is the signed token in `t`.
export async function submitCsatAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/csat?error=1");

  const secret = env.csatSecret;
  const ticketId = secret ? verifyCsatToken(parsed.data.t, secret) : null;
  if (!ticketId) redirect("/csat?error=1");

  await recordCsat(ticketId, parsed.data.score, parsed.data.comment || null);
  redirect("/csat?done=1");
}
