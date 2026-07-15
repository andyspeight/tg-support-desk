import Link from "next/link";
import { LogIn, LogOut, Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { signOutAction } from "@/lib/logout-action";
import { ThemeToggle } from "@/components/theme-toggle";

// Public client help centre (help.travelgenix.io). Open to everyone — anyone can
// browse and raise a ticket without signing in. Signing in (same tg_session SSO
// as the desk) unlocks a client's own ticket history and in-portal replies; all
// of that data stays scoped to the signed-in email.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  const initials = session ? (session.name.match(/\b\w/g) ?? []).slice(0, 2).join("").toUpperCase() || "U" : "";
  const hasName = session ? session.name.toLowerCase() !== session.email.toLowerCase() : false;
  // Where to send a not-signed-in visitor who wants their history: through the
  // cross-domain SSO bridge, back to the home page. Only offered when SSO exists.
  const signInHref = env.ssoBridgeUrl ? `/api/sso/login?return=${encodeURIComponent("/")}` : null;

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
              T
            </span>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">Travelgenix Support</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/new"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
            >
              <Plus className="h-4 w-4" strokeWidth={2} /> Raise a ticket
            </Link>
            {session ? (
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
                <form action={signOutAction}>
                  <button
                    type="submit"
                    title="Sign out"
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
                  >
                    <LogOut className="h-4 w-4" strokeWidth={1.75} /> <span className="hidden sm:inline">Sign out</span>
                  </button>
                </form>
              </div>
            ) : (
              signInHref && (
                <Link
                  href={signInHref}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
                >
                  <LogIn className="h-4 w-4" strokeWidth={1.75} /> <span className="hidden sm:inline">Sign in</span>
                </Link>
              )
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">{children}</main>
    </div>
  );
}
