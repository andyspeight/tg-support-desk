"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  House,
  Inbox,
  LayoutDashboard,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { NotificationsNavItem } from "@/components/notifications-nav";

const LINKS: { href: string; label: string; icon: LucideIcon; ownerOnly?: boolean }[] = [
  { href: "/home", label: "My day", icon: House },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, ownerOnly: true },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/search", label: "Search", icon: Search },
  { href: "/kb", label: "Knowledge base", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {LINKS.filter((link) => isOwner || !link.ownerOnly).map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`) || (link.href === "/inbox" && pathname.startsWith("/ticket"));
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {link.label}
          </Link>
        );
      })}
      <NotificationsNavItem />
    </nav>
  );
}
