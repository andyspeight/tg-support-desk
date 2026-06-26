"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

type Viewer = { email: string; name: string | null };

/** Collision-detection bar. Polls a heartbeat every 15s: marks the current
 *  agent as viewing this ticket and shows a warning when anyone else is too,
 *  so two people don't end up replying over each other. */
export function TicketPresence({
  ticketId,
  heartbeat,
}: {
  ticketId: string;
  heartbeat: (ticketId: string) => Promise<{ viewers: Viewer[] }>;
}) {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    let active = true;
    const beat = async () => {
      try {
        const res = await heartbeat(ticketId);
        if (active) setViewers(res.viewers);
      } catch {
        // best-effort — a failed heartbeat just means no bar this tick
      }
    };
    beat();
    const interval = setInterval(beat, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [ticketId, heartbeat]);

  if (viewers.length === 0) return null;

  const names = viewers.map((v) => v.name || v.email);
  const who =
    names.length === 1
      ? `${names[0]} is`
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are`;

  return (
    <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-100 px-6 py-2 text-sm font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
      <Eye className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>{who} also working on this ticket — take care not to reply over each other.</span>
    </div>
  );
}
