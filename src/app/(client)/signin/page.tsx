import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MailCheck, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeReturnPath } from "@/lib/auth-tokens";
import { requestLinkAction } from "./actions";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20";

// Sign in with an emailed link — the help centre's own sign-in, deliberately
// independent of the Travelify master account (many help-centre contacts don't
// have one). The Travelify SSO stays available as a secondary route for those
// who do.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; sent?: string; error?: string }>;
}) {
  const { return: rawReturn, sent, error } = await searchParams;
  const returnTo = safeReturnPath(rawReturn, "/");

  const session = await getSession();
  if (session) redirect(returnTo);

  const ssoHref = env.ssoBridgeUrl ? `/api/sso/login?return=${encodeURIComponent(returnTo)}` : null;

  return (
    <div className="mx-auto max-w-md">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} /> Help centre
      </Link>

      {sent ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
          </div>
          <h1 className="mt-3 text-lg font-semibold">Check your email</h1>
          <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-ink-2">
            We’ve sent you a sign-in link. Click it within 15 minutes and you’ll be signed in, right back where you
            left off.
          </p>
          <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-ink-3">
            Nothing arrived? Check your spam folder, or{" "}
            <Link
              href={`/signin?return=${encodeURIComponent(returnTo)}`}
              className="font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              request another link
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Sign in to your tickets</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Enter the email you use for support and we’ll send you a secure sign-in link — no password, no account
            set-up.
          </p>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              That sign-in link has expired or was already used — request a fresh one below.
            </div>
          )}

          <form action={requestLinkAction} className="mt-4 space-y-3">
            <input type="hidden" name="return" value={returnTo} />
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              className={FIELD}
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
            >
              Email me a sign-in link
            </button>
          </form>

          {ssoHref && (
            <p className="mt-4 border-t border-line-soft pt-4 text-xs leading-relaxed text-ink-3">
              Have a Travelgenix platform account?{" "}
              <Link href={ssoHref} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                Sign in with your Travelgenix account
              </Link>{" "}
              instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
