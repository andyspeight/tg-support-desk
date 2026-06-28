import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { audit } from "@/lib/db/queries";
import { collectCustomerData } from "@/lib/gdpr";

export const dynamic = "force-dynamic";

// Owner-gated GDPR subject-access export. Returns a downloadable JSON of
// everything held for a customer email. Owner-only because it surfaces full
// ticket history (including internal notes) for the compliance team to review.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.isAgent || !env.ownerEmails.includes(session.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const email = (new URL(request.url).searchParams.get("email") ?? "").trim();
  if (!email) return new Response("Provide ?email=", { status: 400 });

  const data = await collectCustomerData(email);
  await audit("human", session.email, "gdpr.export", undefined, { email: data.email, tickets: data.ticketCount });

  const safe = email.replace(/[^a-z0-9._@-]/gi, "_");
  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="gdpr-export-${safe}.json"`,
      "cache-control": "no-store",
    },
  });
}
