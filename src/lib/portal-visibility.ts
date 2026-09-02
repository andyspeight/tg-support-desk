// Pure portal access policy — no server-only/db imports, so the rule that
// decides what a client can read is unit-testable on its own.
//
// Two levels, deliberately:
//
//   1. Per COMPANY (company_settings.restrict_ticket_visibility). Off by
//      default, and off means the long-standing behaviour: everyone at that
//      client sees all of the client's tickets. Nothing changes for a company
//      until someone turns this on.
//
//   2. Per PERSON (company_members.can_see_all_tickets), which only comes into
//      play once a company is restricted. Then it's own-tickets-only unless
//      that person has been explicitly granted the company-wide view — because
//      a person's company is often *inferred* from their email domain, and an
//      inference shouldn't hand over colleagues' conversations.

/** Null name just means we never recorded one; access doesn't depend on it. */
export type VisibleCompany = { id: string; name: string | null };

export type VisibilityInput = {
  /** The company this person resolves to, however that was determined. */
  company: VisibleCompany | null;
  /** Is that company's portal restricted? (company-level switch) */
  restricted: boolean;
  /** Their explicit company link, if Travelgenix has set one. */
  member: { client_id: string | null; can_see_all_tickets: boolean } | null;
};

/** The company whose tickets this person may read, or null for own-only. */
export function companyVisibleTo({ company, restricted, member }: VisibilityInput): VisibleCompany | null {
  if (!company) return null;
  // Unrestricted company: everyone who resolves to it sees its tickets.
  if (!restricted) return company;
  // Restricted: only an explicit grant, and only for that same company.
  if (!member?.can_see_all_tickets) return null;
  return member.client_id === company.id ? company : null;
}
