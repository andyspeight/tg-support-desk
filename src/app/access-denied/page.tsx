export default function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">TG Support Desk</h1>
        <p className="mt-3 text-sm text-zinc-600">
          You need a Travelgenix agent session to use the support desk. Sign in via the Travelgenix
          dashboard, then come back here.
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          If you believe you should have access, ask an admin to add you to the agent list.
        </p>
      </div>
    </div>
  );
}
