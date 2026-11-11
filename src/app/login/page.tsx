import { redirect } from "next/navigation";
import { bnetConfigured, config } from "@/lib/config";
import { getCurrentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  denied: "Battle.net sign-in was cancelled.",
  state: "The sign-in link expired. Try again.",
  bnet: "Battle.net did not answer as expected. Try again in a minute.",
  "not-configured": "Battle.net sign-in is not set up on this server yet (BNET_CLIENT_ID / BNET_CLIENT_SECRET).",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Raid Roster</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with Battle.net to mark which raid nights you can make. You can change the rows of the roster
          characters on your own account.
        </p>

        {message && <p className="mt-4 rounded bg-red-950/60 px-3 py-2 text-sm text-red-200">{message}</p>}

        {bnetConfigured() ? (
          <a
            href="/api/auth/login"
            className="mt-5 flex w-full items-center justify-center rounded bg-accent px-4 py-2.5 font-medium text-white hover:brightness-110"
          >
            Sign in with Battle.net
          </a>
        ) : (
          !message && (
            <p className="mt-4 text-sm text-amber-300">
              Battle.net sign-in is not set up on this server yet (BNET_CLIENT_ID / BNET_CLIENT_SECRET).
            </p>
          )
        )}

        {config.devLogin && (
          <form action="/api/auth/dev" method="post" className="mt-6 space-y-2 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-amber-300">Local test sign-in</p>
            <input
              name="battletag"
              placeholder="BattleTag, e.g. Tester#1234"
              required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              name="characters"
              placeholder="Character names, comma-separated"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
            <button className="w-full rounded border border-border px-3 py-2 text-sm hover:bg-surface-2">
              Sign in without Battle.net
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
