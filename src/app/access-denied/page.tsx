export default function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-md rounded-lg border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-ink">TG Support Desk</h1>
        <p className="mt-3 text-sm text-ink-2">
          You need a Travelgenix agent session to use the support desk. Sign in via the Travelgenix
          dashboard, then come back here.
        </p>
        <p className="mt-3 text-xs text-ink-3">
          If you believe you should have access, ask an admin to add you to the agent list.
        </p>
      </div>
    </div>
  );
}
