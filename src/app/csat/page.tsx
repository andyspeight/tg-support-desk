import { verifyCsatToken } from "@/lib/csat";
import { env } from "@/lib/env";
import { submitCsatAction } from "./actions";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 shadow-sm">{children}</div>
    </div>
  );
}

export default async function CsatPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; done?: string; error?: string }>;
}) {
  const { t, done, error } = await searchParams;

  if (done) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-ink">Thank you</h1>
        <p className="mt-2 text-sm text-ink-2">Your feedback has been recorded — we appreciate it.</p>
      </Shell>
    );
  }

  const secret = env.csatSecret;
  const ticketId = t && secret ? verifyCsatToken(t, secret) : null;

  if (error || !ticketId) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-ink">This link isn’t valid</h1>
        <p className="mt-2 text-sm text-ink-2">
          The survey link may have expired or been mistyped. If you still need help, just reply to our email.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-ink">How did we do?</h1>
      <p className="mt-1 text-sm text-ink-2">Tap a rating for the support you just received.</p>
      <form action={submitCsatAction} className="mt-5">
        <input type="hidden" name="t" value={t} />
        <textarea
          name="comment"
          rows={3}
          placeholder="Anything you’d like to add? (optional)"
          className="mb-4 w-full resize-y rounded-md border border-line bg-surface p-2 text-sm placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        <div className="flex justify-between gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              name="score"
              value={n}
              className="flex-1 rounded-md border border-line bg-surface py-3 text-lg font-semibold text-ink hover:border-accent-400 hover:bg-accent-50 dark:hover:bg-accent-500/10"
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-ink-3">
          <span>Poor</span>
          <span>Excellent</span>
        </div>
      </form>
    </Shell>
  );
}
