import Link from "next/link";
import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitTicketForm } from "@/components/submit-ticket-form";
import { submitPublicTicketAction } from "./actions";

export const metadata: Metadata = {
  title: "Contact Travelgenix Support",
  description: "Send the Travelgenix support team a request — we’ll get back to you by email.",
};

export default function SubmitPage() {
  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/submit" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
              T
            </span>
            <span className="text-sm font-semibold tracking-tight">Travelgenix Support</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-2xl">
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

          <div className="mt-8">
            <SubmitTicketForm action={submitPublicTicketAction} />
          </div>

          <p className="mt-5 text-center text-xs text-ink-3">
            Already a Travelgenix client?{" "}
            <Link href="/portal" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              Sign in to the support portal
            </Link>{" "}
            to track your tickets.
          </p>
        </div>
      </main>
    </div>
  );
}
