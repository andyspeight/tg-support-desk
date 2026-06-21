import { getSession } from "@/lib/auth";
import { unreadCount } from "@/lib/db/notifications";

export const dynamic = "force-dynamic";

// Polled by the nav bell. Cheap (count query), agent-authed, fails soft to 0.
export async function GET() {
  const session = await getSession();
  if (!session?.isAgent) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json({ unread: await unreadCount(session.email) });
  } catch {
    return Response.json({ unread: 0 });
  }
}
