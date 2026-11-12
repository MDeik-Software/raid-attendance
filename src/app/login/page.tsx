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
  switch: "Battle.net did not sign you out, so it would send the same account back.",
  "not-configured": "Battle.net sign-in is not set up on this server yet (BNET_CLIENT_ID / BNET_CLIENT_SECRET).",
};

const PRIMARY_BUTTON =
  "mt-5 flex w-full items-center justify-center rounded bg-accent px-4 py-2.5 font-medium text-white hover:brightness-110";
const SECONDARY_BUTTON =
  "mt-3 flex w-full items-center justify-center rounded border border-border px-4 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground";

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

        {!bnetConfigured() ? null : error === "team" ? (
          // Refused: offer the one-click switch, with the manual way in case Battle.net refuses the sign-out.
          <>
            <a href="/api/auth/switch" className={PRIMARY_BUTTON}>
              Use a different Battle.net account
            </a>
            <p className="mt-2 text-center text-xs text-muted">
              If Battle.net shows an error instead, {signOutLink} in a new tab, then come back and sign in again.
            </p>
            <a href="/api/auth/login" className={SECONDARY_BUTTON}>
              Try this account again
            </a>
          </>
        ) : error === "switch" ? (
          <>
            <ol className="mt-4 list-decimal space-y-1 rounded border border-border py-2 pl-8 pr-3 text-sm text-muted">
              <li>{signOutLink} (opens in a new tab).</li>
              <li>Come back to this tab and sign in with the other account.</li>
            </ol>
            <a href="/api/auth/login" className={PRIMARY_BUTTON}>
              Sign in with Battle.net
            </a>
          </>
        ) : (
          <>
            <a href="/api/auth/login" className={PRIMARY_BUTTON}>
              Sign in with Battle.net
            </a>
            <p className="mt-2 text-center text-xs text-muted">
              Wrong Battle.net account? {signOutLink} first, then sign in here.
            </p>
          </>
        )}

        {!bnetConfigured() && !message && (
          <p className="mt-4 text-sm text-amber-300">
            Battle.net sign-in is not set up on this server yet (BNET_CLIENT_ID / BNET_CLIENT_SECRET).
          </p>
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
