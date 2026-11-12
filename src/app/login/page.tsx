import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REFUSED_COOKIE } from "@/lib/auth-cookies";
import { BNET_SIGN_OUT_URL } from "@/lib/bnet";
import { bnetConfigured, config } from "@/lib/config";
import { getCurrentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  denied: "Battle.net sign-in was cancelled.",
  state: "The sign-in link expired. Try again.",
  bnet: "Battle.net did not answer as expected. Try again in a minute.",
  db: "Battle.net sign-in worked, but the app could not reach its database. Try again in a minute; if it keeps failing, the server's database settings need checking.",
  team: "This site is for the raid team only, and none of the characters on that Battle.net account are on it. If you raid with us, ask an officer; if you just joined the guild, Battle.net can take a few hours to list you.",
  "not-configured": "Battle.net sign-in is not set up on this server yet (BNET_CLIENT_ID / BNET_CLIENT_SECRET).",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const refusedAs = error === "team" ? (await cookies()).get(REFUSED_COOKIE)?.value : undefined;
  const message = refusedAs
    ? `Battle.net signed you in as ${refusedAs}, and none of that account's characters are on the raid team. If you raid with us, ask an officer; if you just joined the guild, Battle.net can take a few hours to list you.`
    : typeof error === "string"
      ? ERRORS[error]
      : undefined;
  const signOutLink = (
    <a href={BNET_SIGN_OUT_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
      Sign out of Battle.net
    </a>
  );

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Raid Roster</h1>
        <p className="mt-2 text-sm text-muted">
          For the raid team only. Sign in with Battle.net to mark which raid nights you can make. You then pick the
          characters you raid on, and can change their rows on the grid.
        </p>

        {message && <p className="mt-4 rounded bg-red-950/60 px-3 py-2 text-sm text-red-200">{message}</p>}

        {error === "team" && bnetConfigured() && (
          <div className="mt-4 rounded border border-border px-3 py-2 text-sm text-muted">
            <p className="font-medium text-foreground">Raid on another Battle.net account?</p>
            <p className="mt-1">Battle.net keeps you signed in and sends the same account back, so first:</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>{signOutLink} (opens in a new tab).</li>
              <li>Come back to this tab and sign in with the other account.</li>
            </ol>
          </div>
        )}

        {bnetConfigured() ? (
          <>
            <a
              href="/api/auth/login"
              className="mt-5 flex w-full items-center justify-center rounded bg-accent px-4 py-2.5 font-medium text-white hover:brightness-110"
            >
              Sign in with Battle.net
            </a>
            {error !== "team" && (
              <p className="mt-2 text-center text-xs text-muted">
                Wrong Battle.net account? {signOutLink} first, then sign in here.
              </p>
            )}
          </>
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
