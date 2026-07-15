/** True when the string is an email address rather than a human name. */
export function isEmailish(s: string | null | undefined): boolean {
  return /\S@\S+\.\S+/.test((s ?? "").trim());
}

/** Best-effort human name recovered from an email's local part:
 *  "darren.swan@x.com" → "Darren Swan". Returns null when there's no safe
 *  recovery — a single unbroken token ("darrenswan") or digits — so callers
 *  show nothing rather than a mangled guess like "Darrenswan". */
export function nameFromEmail(email: string): string | null {
  const local = (email ?? "").trim().split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length < 2 || !words.every((w) => /^[a-z]+$/i.test(w))) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** The best display name we can honestly show: the real name when we have one,
 *  else a clean recovery from the email, else null (caller falls back to the
 *  email address or a neutral greeting). */
export function bestDisplayName(name: string | null | undefined, email: string): string | null {
  const n = (name ?? "").trim();
  if (n && !isEmailish(n)) return n;
  return nameFromEmail(email);
}

/** Friendly first name from a display name OR an email. Handles the case where
 *  auth only gives us the email: "andy.speight@agendas.group" → "Andy" — but
 *  never mangles one that doesn't split ("darrenswan@gmail.com" → "there"). */
export function firstNameFrom(nameOrEmail: string | null | undefined): string {
  const raw = (nameOrEmail ?? "").trim();
  if (!raw) return "there";
  if (raw.includes("@")) {
    const recovered = nameFromEmail(raw);
    return recovered ? recovered.split(" ")[0]! : "there";
  }
  const token = raw.split(/[\s._-]+/).filter(Boolean)[0];
  if (!token) return "there";
  return token.charAt(0).toUpperCase() + token.slice(1);
}
