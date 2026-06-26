import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Constant-time verification of the `Authorization: Bearer <CRON_SECRET>` header
 * used by the Vercel cron routes and the internal /api/ai/resolve trigger.
 * CRON_SECRET is the most-reused credential (it also signs CSAT links), so the
 * compare must not leak a timing signal via early-exit string `!==`.
 * Returns a 401 Response to short-circuit with, or null when authorised.
 */
export function requireCron(request: Request): Response | null {
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.cronSecret}`);
  const ok = provided.length === expected.length && timingSafeEqual(provided, expected);
  return ok ? null : new Response("Unauthorized", { status: 401 });
}
