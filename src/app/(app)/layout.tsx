import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.isAgent) redirect("/access-denied");

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-4">
          <span className="text-sm font-semibold tracking-tight">TG Support Desk</span>
        </div>
        <Nav />
        <div className="mt-auto truncate border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
          {session.email}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
