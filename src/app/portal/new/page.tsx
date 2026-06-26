import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { raiseTicketAction, assistDraftAction } from "@/app/portal/actions";
import { NewTicketForm } from "@/components/portal/new-ticket-form";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; body?: string }>;
}) {
  await requireClient();
  const { subject, body } = await searchParams;

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/portal" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Raise a ticket</h1>
      <p className="mt-1 text-sm text-ink-2">
        Tell us what’s happening. The assistant takes a quick look first, and the team follows up.
      </p>

      <div className="mt-5">
        <NewTicketForm raise={raiseTicketAction} assist={assistDraftAction} defaultSubject={subject} defaultBody={body} />
      </div>
    </div>
  );
}
