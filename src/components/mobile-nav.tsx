"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";

/** Hamburger + slide-in drawer for the agent app on mobile. The desktop sidebar
 *  (md+) is rendered separately by the layout; this is shown only below md. */
export function MobileNav({ isOwner, name, email }: { isOwner: boolean; name: string; email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[82vw] flex-col border-r border-line bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
              <span className="text-sm font-semibold tracking-tight">TG Support Desk</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1 text-ink-3 hover:bg-surface-2"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            {/* Closing on click here dismisses the drawer when a nav link is tapped. */}
            <div onClick={() => setOpen(false)} className="min-h-0 flex-1 overflow-y-auto">
              <Nav isOwner={isOwner} />
            </div>
            <div className="border-t border-line-soft p-2">
              <ThemeToggle />
            </div>
            <div className="border-t border-line-soft px-4 py-3">
              <p className="truncate text-xs font-medium text-ink">{name}</p>
              {name.toLowerCase() !== email.toLowerCase() && <p className="truncate text-[11px] text-ink-3">{email}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
