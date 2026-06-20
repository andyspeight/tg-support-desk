"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

// Sidebar bell with a live unread badge. Polls the count route on the same
// cadence as the inbox poller; refreshes on navigation too.
export function NotificationsNavItem() {
  const pathname = usePathname();
  const active = pathname === "/notifications";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (alive) setUnread(data.unread ?? 0);
      } catch {
        /* ignore — transient */
      }
    };
    load();
    const timer = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
        active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <Bell className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="flex-1">Notifications</span>
      {unread > 0 && (
        <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white dark:bg-brand-500">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
