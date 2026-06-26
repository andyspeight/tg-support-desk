import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    // Not signed in. If the cross-domain SSO bridge is configured, start it;
    // otherwise fall back to the access-denied page (current pre-SSO behaviour).
    if (env.ssoBridgeUrl) {
      redirect(`/api/sso/login?return=${encodeURIComponent("/home")}`);
    }
    redirect("/access-denied");
  }
  if (!session.isAgent) redirect("/access-denied");
  const isOwner = env.ownerEmails.includes(session.email);

  return (
    <div className="flex h-[100dvh] bg-canvas text-ink">
      {/* Desktop sidebar (md+). On mobile it lives in the drawer below. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line-soft px-4 py-4">
          <span className="text-sm font-semibold tracking-tight">TG Support Desk</span>
        </div>
        <Nav isOwner={isOwner} />
        <div className="mt-auto border-t border-line-soft p-2">
          <ThemeToggle />
        </div>
        <div className="border-t border-line-soft px-4 py-3">
          <p className="truncate text-xs font-medium text-ink">{session.name}</p>
          {session.name.toLowerCase() !== session.email.toLowerCase() && (
            <p className="truncate text-[11px] text-ink-3">{session.email}</p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with the menu drawer. */}
        <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 md:hidden">
          <MobileNav isOwner={isOwner} name={session.name} email={session.email} />
          <span className="text-sm font-semibold tracking-tight">TG Support Desk</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
