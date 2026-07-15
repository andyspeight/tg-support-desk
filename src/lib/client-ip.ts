import "server-only";
import { headers } from "next/headers";

// Client IP for rate-limiting, from a platform-trusted source. The leftmost
// x-forwarded-for hop is client-supplied and spoofable — rotating it defeats a
// per-IP throttle. On Vercel, x-vercel-forwarded-for (and x-real-ip) are set by
// the edge and can't be spoofed by the client, so prefer those; fall back to the
// RIGHTMOST x-forwarded-for hop (the one closest to us) before "unknown".
export async function clientIp(): Promise<string> {
  const h = await headers();

  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim() || "unknown";

  const real = h.get("x-real-ip");
  if (real?.trim()) return real.trim();

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!; // rightmost = platform-appended
  }
  return "unknown";
}
