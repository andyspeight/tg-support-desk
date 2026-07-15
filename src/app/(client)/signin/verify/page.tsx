import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogIn, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth";
import { safeReturnPath } from "@/lib/auth-tokens";
import { peekLoginToken } from "@/lib/portal-login";
import { completeSignInAction } from "../actions";

// Where the emailed sign-in link lands. The token is verified here but NEVER
// consumed on GET — signing in happens only via the explicit POST below, so a
// link-scanner prefetch or a cross-site GET can't burn the token or establish a
// session (login-CSRF fix). Showing whom you're about to sign in as is also a
// guard against being tricked into a foreign account.
export default async function VerifySignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; return?: string }>;
}) {
  const { token, return: rawReturn } = await searchParams;
  const returnTo = safeReturnPath(rawReturn, "/");

  const session = await getSession();
  if (session) redirect(returnTo); // already signed in — straight through

  const preview = peekLoginToken(token ?? "");

  return (
    <div className="mx-auto max-w-md">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} /> Help centre
      </Link>

      <div className="mt-4 rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-sm">
        {preview ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-600/10">
              <LogIn className="h-6 w-6 text-brand-600 dark:text-brand-300" strokeWidth={1.5} />
            </div>
            <h1 className="mt-3 text-lg font-semibold">Confirm sign-in</h1>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-ink-2">
              You’re about to sign in to Travelgenix Support as{" "}
              <span className="font-medium text-ink">{preview.email}</span>.
            </p>
            <form action={completeSignInAction} className="mt-4">
              <input type="hidden" name="token" value={token ?? ""} />
              <input type="hidden" name="return" value={returnTo} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              >
                <LogIn className="h-4 w-4" strokeWidth={1.75} /> Sign in as {preview.email}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            </div>
            <h1 className="mt-3 text-lg font-semibold">Link expired</h1>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-ink-2">
              That sign-in link has expired or was already used — they’re good for 15 minutes and one use.
            </p>
            <Link
              href={`/signin?return=${encodeURIComponent(returnTo)}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 active:translate-y-px"
            >
              Request a new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
