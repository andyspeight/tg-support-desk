import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.isAgent) redirect("/access-denied");

  return (
    <div className="flex h-screen bg-canvas text-ink">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line-soft px-4 py-4">
          <span className="text-sm font-semibold tracking-tight">TG Support Desk</span>
        </div>
        <Nav />
        <div className="mt-auto border-t border-line-soft p-2">
          <ThemeToggle />
        </div>
        <div className="truncate border-t border-line-soft px-4 py-3 text-xs text-ink-2">
          {session.email}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
