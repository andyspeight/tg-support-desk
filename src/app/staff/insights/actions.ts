"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import { audit, setTrendSnapshot } from "@/lib/db/queries";
import { computeInsights } from "@/lib/insights/compute";

/** Recompute the insights snapshot on demand (the cron also does this hourly).
 *  Agent-gated; makes one AI clustering call + bounded Airtable lookups. */
export async function refreshInsightsAction(): Promise<void> {
  const session = await requireAgent();
  const snapshot = await computeInsights();
  await setTrendSnapshot(snapshot);
  await audit("human", session.email, "insights.refreshed", undefined, {
    clusters: snapshot.clusters.length,
    clients_to_watch: snapshot.clientsToWatch.length,
  });
  revalidatePath("/staff/insights");
}
