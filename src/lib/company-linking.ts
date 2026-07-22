import "server-only";
import { audit } from "@/lib/db/queries";
import { emailDomain } from "@/lib/channels/email-parse";
import { linkDomainForCompany } from "@/lib/portal-company";

/**
 * After an exact-email company link is written, also link the requester's
 * CORPORATE domain to the same company so colleagues auto-associate — then audit
 * what happened. Free-mail domains (and no clientId) are a no-op. Create-if-
 * absent: a domain already claimed by another company is audited as a conflict,
 * never silently taken over. Best-effort; never throws (the exact-email link has
 * already succeeded by the time this is called). Shared by every link action.
 */
export async function linkCorporateDomain(opts: {
  actor: string;
  email: string;
  clientId: string;
  clientName: string | null;
  target?: { type: "ticket"; id: string };
}): Promise<void> {
  try {
    const result = await linkDomainForCompany({
      email: opts.email,
      clientId: opts.clientId,
      clientName: opts.clientName,
      createdBy: opts.actor,
    });
    const domain = emailDomain(opts.email);
    if (result.created) {
      await audit("human", opts.actor, "company_domain.linked", opts.target, {
        domain,
        client_id: opts.clientId,
        tickets_stamped: result.stamped,
      });
    } else if (result.conflictClientId) {
      await audit("human", opts.actor, "company_domain.conflict", opts.target, {
        domain,
        existing_client_id: result.conflictClientId,
        requested_client_id: opts.clientId,
      });
    }
  } catch (error) {
    console.error("linkCorporateDomain failed:", error);
  }
}
