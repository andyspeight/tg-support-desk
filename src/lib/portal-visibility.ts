// Pure portal access policy — no server-only/db imports, so the rule that
// decides what a client can read is unit-testable on its own.
//
// Default deny. Belonging to a company is not consent to read everything that
// company has ever raised: a person's company is often *inferred* (their email
// domain matched a client record), and inference must never widen access to
// colleagues' conversations. Seeing all of a company's tickets is an explicit
// per-person grant a human at Travelgenix sets.

/** Null name just means we never recorded one; access doesn't depend on it. */
export type VisibleCompany = { id: string; name: string | null };

/** The company whose tickets this person may read, or null for own-only.
 *  Both conditions are required: a linked company AND the explicit grant. */
export function companyVisibleTo(
  member: { client_id: string | null; client_name?: string | null; can_see_all_tickets: boolean } | null,
): VisibleCompany | null {
  if (!member?.client_id || !member.can_see_all_tickets) return null;
  return { id: member.client_id, name: member.client_name ?? null };
}
