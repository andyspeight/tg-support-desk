/** Friendly first name from a display name OR an email. Handles the case where
 *  SSO only gives us the email: "andy.speight@agendas.group" → "Andy". */
export function firstNameFrom(nameOrEmail: string | null | undefined): string {
  const raw = (nameOrEmail ?? "").trim();
  if (!raw) return "there";
  const base = raw.includes("@") ? raw.split("@")[0]! : raw;
  const token = base.split(/[\s._-]+/).filter(Boolean)[0];
  if (!token) return "there";
  return token.charAt(0).toUpperCase() + token.slice(1);
}
