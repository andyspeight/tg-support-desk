import { env } from "@/lib/env";
import { requireCron } from "@/lib/cron-auth";
import { inboxCounts } from "@/lib/db/queries";
import { sendEmail } from "@/lib/channels/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Daily per-agent triage email: open / unassigned / breaching at a glance.
// Dormant (no-op) until Gmail is configured. Agents with nothing open are skipped.
export async function GET(request: Request) {
  const unauthorised = requireCron(request);
  if (unauthorised) return unauthorised;
  if (!env.gmailConfigured) return Response.json({ skipped: "gmail not configured" });

  const agents = env.agentEmails;
  if (agents.length === 0) return Response.json({ skipped: "no agents configured" });

  const base = env.appBaseUrl.replace(/\/$/, "");
  let sent = 0;
  for (const agent of agents) {
    try {
      const c = await inboxCounts(agent);
      if (c.mine === 0 && c.unassigned === 0 && c.breaching === 0) continue; // nothing to nudge
      const text = [
        "Good morning — your support desk at a glance:",
        "",
        `• Your open tickets: ${c.mine}`,
        `• Unassigned waiting: ${c.unassigned}`,
        `• Breaching SLA: ${c.breaching}`,
        `• Escalated (needs a human): ${c.escalated}`,
        "",
        base ? `Open the inbox: ${base}/inbox` : "Open the inbox to get started.",
      ].join("\n");
      await sendEmail({ to: agent, subject: "[TG Support] Your morning summary", text });
      sent++;
    } catch (err) {
      console.error(`morning-digest to ${agent}:`, err);
    }
  }
  return Response.json({ sent, agents: agents.length });
}
