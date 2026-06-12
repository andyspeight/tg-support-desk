"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/kb", label: "Knowledge base" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`) || (link.href === "/inbox" && pathname.startsWith("/ticket"));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-2 text-sm ${
              active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
