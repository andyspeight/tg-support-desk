import "server-only";
import { db } from "./client";
import { env } from "@/lib/env";
import type { Notification, Ticket } from "./types";

// Agent notifications spine. Every alert in the app — assignment, customer
// reply, escalation, @mention, stale ticket — is one call into notify().

export type NotificationType =
  | "assigned"
  | "customer_reply"
  | "escalated"
  | "mention"
  | "stale"
  | "snooze_due";

type NotifyInput = {
  recipients: string[];
  type: NotificationType;
  title: string;
  ticketId?: string | null;
  body?: string | null;
  actor?: string | null;
  /** Never notify this address (usually the actor — don't ping yourself). */
  skip?: string | null;
};

/** Who should hear about a ticket's activity: the owner plus any watchers. */
export function ticketRecipients(ticket: Pick<Ticket, "assignee" | "watchers">): string[] {
  return [...(ticket.assignee ? [ticket.assignee] : []), ...ticket.watchers];
}

/**
 * Create notifications. DEFENSIVE BY DESIGN: a notification failure must never
 * break the action that triggered it (assignment, reply, escalation). Mirrors
 * the audit() contract — errors are logged, never thrown.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const skip = input.skip?.trim().toLowerCase();
    const recipients = [
      ...new Set(input.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean)),
    ].filter((r) => r !== skip);
    if (recipients.length === 0) return;

    const rows = recipients.map((recipient) => ({
      tenant_id: env.tenantId,
      recipient,
      type: input.type,
      ticket_id: input.ticketId ?? null,
      title: input.title.slice(0, 300),
      body: input.body ? input.body.slice(0, 1000) : null,
      actor: input.actor ?? null,
    }));
    const { error } = await db().from("notifications").insert(rows);
    if (error) console.error(`notify(${input.type}): ${error.message}`);
  } catch (error) {
    console.error("notify failed:", error);
  }
}

export async function listNotifications(recipient: string, limit = 50): Promise<Notification[]> {
  const { data, error } = await db()
    .from("notifications")
    .select()
    .eq("tenant_id", env.tenantId)
    .eq("recipient", recipient.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listNotifications: ${error.message}`);
  return data ?? [];
}

export async function unreadCount(recipient: string): Promise<number> {
  const { count, error } = await db()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", env.tenantId)
    .eq("recipient", recipient.toLowerCase())
    .is("read_at", null);
  if (error) throw new Error(`unreadCount: ${error.message}`);
  return count ?? 0;
}

export async function markRead(id: string, recipient: string): Promise<void> {
  const { error } = await db()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient", recipient.toLowerCase())
    .is("read_at", null);
  if (error) throw new Error(`markRead: ${error.message}`);
}

export async function markAllRead(recipient: string): Promise<void> {
  const { error } = await db()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", env.tenantId)
    .eq("recipient", recipient.toLowerCase())
    .is("read_at", null);
  if (error) throw new Error(`markAllRead: ${error.message}`);
}

/** Dedupe guard for recurring sweeps (e.g. the hourly stale-ticket cron) so the
 *  same ticket doesn't re-alert an agent every run. */
export async function hasRecentNotification(
  recipient: string,
  ticketId: string,
  type: NotificationType,
  withinHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 3_600_000).toISOString();
  const { count, error } = await db()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient", recipient.toLowerCase())
    .eq("ticket_id", ticketId)
    .eq("type", type)
    .gte("created_at", since);
  if (error) {
    console.error(`hasRecentNotification: ${error.message}`);
    return true; // fail safe: assume already notified, never spam
  }
  return (count ?? 0) > 0;
}

/** Unread + not-yet-emailed notifications within a recent window — the source
 *  for the email mirror. Bounded so enabling Gmail doesn't backfill old ones. */
export async function listUnemailedNotifications(withinHours = 12): Promise<Notification[]> {
  const since = new Date(Date.now() - withinHours * 3_600_000).toISOString();
  const { data, error } = await db()
    .from("notifications")
    .select()
    .eq("tenant_id", env.tenantId)
    .is("emailed_at", null)
    .is("read_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`listUnemailedNotifications: ${error.message}`);
  return data ?? [];
}

export async function markEmailed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db()
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(`markEmailed: ${error.message}`);
}
