import Link from "next/link";
import type { Metadata } from "next";
import { MessageSquarePlus, Search, Mail } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitTicketForm } from "@/components/submit-ticket-form";
import { submitPublicTicketAction, assistDraftAction } from "./actions";

export const metadata: Metadata = {
  title: "Contact Travelgenix Support",
  description: "Send the Travelgenix support team a request — we’ll get back to you by email.",
};

const STEPS = [
  { icon: MessageSquarePlus, title: "Send us the details", body: "The more you tell us, the faster we can help — the assistant will flag anything useful to add." },
  { icon: Search, title: "We take a look", body: "Your request goes straight into the support queue and we investigate." },
  { icon: Mail, title: "We reply by email", body: "You’ll hear back at the address you give us — usually within a few hours." },
];

export default function SubmitPage() {
  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/submit" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
              T
            </span>
            <span className="text-sm font-semibold tracking-tight">Travelgenix Support</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
            </span>
            Typically replies within a few hours
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">How can we help?</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2 sm:text-base">
            Send us a request and the team will pick it up. We’ll reply by email, so there’s nothing to log in to.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <SubmitTicketForm submit={submitPublicTicketAction} assist={assistDraftAction} />

          <aside className="space-y-6 lg:pt-2">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold">What happens next</h2>
              <ol className="mt-3 space-y-4">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <li key={step.title} className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-300">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">
                          <span className="mr-1.5 tabular-nums text-ink-3">{i + 1}.</span>
                          {step.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{step.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <p className="px-1 text-xs leading-relaxed text-ink-3">
              Already a Travelgenix client?{" "}
              <Link href="/portal" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                Sign in to the support portal
              </Link>{" "}
              to track your tickets and get instant answers.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
