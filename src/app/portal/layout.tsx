import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

// Client support portal — any authenticated Travelgenix user (same tg_session
// SSO as the agent app). All data is scoped to the signed-in client's email.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/access-denied");

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="text-sm font-semibold tracking-tight">
            Travelgenix Support
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/portal/new"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              Raise a ticket
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
