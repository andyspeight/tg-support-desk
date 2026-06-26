import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

// Client support portal — any authenticated Travelgenix user (same tg_session
// SSO as the agent app). All data is scoped to the signed-in client's email.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/access-denied");

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
              T
            </span>
            <span className="text-sm font-semibold tracking-tight">Travelgenix Support</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/portal/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 active:translate-y-px"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Raise a ticket
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">{children}</main>
    </div>
  );
}
