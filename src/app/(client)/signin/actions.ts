"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeReturnPath } from "@/lib/auth-tokens";
import { requestLoginLink } from "@/lib/portal-login";

const schema = z.object({
  email: z.string().trim().email().max(200),
  return: z.string().max(512).optional(),
});

/** Email a sign-in link. Always lands on the same "check your inbox" state —
 *  whether or not the send happened (rate limits fail silently inside), so the
 *  form can't be used to probe addresses. */
export async function requestLinkAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    return: formData.get("return") ?? undefined,
  });
  const returnTo = safeReturnPath(parsed.success ? parsed.data.return : "/", "/");
  if (!parsed.success) redirect(`/signin?return=${encodeURIComponent(returnTo)}`);

  const fwd = (await headers()).get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]!.trim() || "unknown";
  try {
    await requestLoginLink(parsed.data.email, ip, returnTo);
  } catch {
    // Fail to the same confirmation — never block on (or reveal) send trouble;
    // the client can simply request another link.
  }
  redirect(`/signin?sent=1&return=${encodeURIComponent(returnTo)}`);
}
