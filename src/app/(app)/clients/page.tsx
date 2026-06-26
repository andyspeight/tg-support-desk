import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { listClientTickets } from "@/lib/db/queries";
import { getClientById } from "@/lib/integrations/airtable-clients";
import { ClientTicketsView } from "@/components/client-tickets-view";

export default async function ClientTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; email?: string }>;
}) {
  await requireAgent();
  const { client, email } = await searchParams;
  const clientId = client?.trim() ? client.trim() : null;
  const requesterEmail = (email ?? "").trim();
  if (!clientId && !requesterEmail) notFound();

  const [tickets, record] = await Promise.all([
    listClientTickets({ clientId, requesterEmail }).catch(() => []),
    clientId ? getClientById(clientId).catch(() => null) : Promise.resolve(null),
  ]);

  const clientName = record
    ? String(record.fields["ClientName"] ?? record.fields["Trading Name"] ?? "").trim()
    : "";
  const heading = clientName || requesterEmail || "Client tickets";
  const subtitle = clientId
    ? "All tickets for this client across every contact."
    : `All tickets from ${requesterEmail}.`;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Inbox
      </Link>
      <h1 className="mt-2 text-lg font-semibold">{heading}</h1>
      <p className="text-sm text-ink-2">{subtitle}</p>

      <ClientTicketsView tickets={tickets} />
    </div>
  );
}
