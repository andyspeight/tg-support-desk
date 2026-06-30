import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { ThemeToggle } from "@/components/theme-toggle";

// Client support portal — any authenticated Travelgenix user (same tg_session
// SSO as the agent app). All data is scoped to the signed-in client's email.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    // Not signed in. Take them through the cross-domain SSO bridge (so a client
    // arriving from a public KB link can sign in and land back here), falling
    // back to access-denied only when SSO isn't configured.
    if (env.ssoBridgeUrl) redirect(`/api/sso/login?return=${encodeURIComponent("/portal")}`);
    redirect("/access-denied");
  }

  const initials = (session.name.match(/\b\w/g) ?? []).slice(0, 2).join("").toUpperCase() || "U";
  const hasName = session.name.toLowerCase() !== session.email.toLowerCase();

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
              T
            </span>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">Travelgenix Support</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/portal/new"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
            >
              <Plus className="h-4 w-4" strokeWidth={2} /> Raise a ticket
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-semibold text-ink">{session.name}</p>
                {hasName && <p className="text-xs text-ink-3">{session.email}</p>}
              </div>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-sm font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200"
                title={session.email}
                aria-hidden
              >
                {initials}
              </span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">{children}</main>
    </div>
  );
}
