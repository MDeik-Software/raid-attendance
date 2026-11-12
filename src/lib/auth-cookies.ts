import "server-only";
import { NextResponse } from "next/server";
import { anyOnTeam } from "./access";
import type { BnetCharacter } from "./bnet";
import { hasActiveCharacter, syncAccountCharacters } from "./claims";
import { config, secureCookies } from "./config";
import { SIGN_IN_MAX_AGE_MS, refreshGuildIfStale } from "./guild-refresh";
import { forgetUser, upsertUser } from "./repo";
import { createSession, isAdminBattletag, sessionCookie } from "./session";

export const STATE_COOKIE = "rr_oauth_state";
/** The BattleTag a refused sign-in used, kept briefly so the sign-in page can say which account it was. */
export const REFUSED_COOKIE = "rr_refused";

/** Absolute URL on this app, built from APP_URL so it is right behind a reverse proxy. */
export function appUrl(path: string): URL {
  return new URL(path, `${config.appUrl}/`);
}

/**
 * Lets in officers and players with a raid team character on their account. Anyone else is turned away
 * without a session, and nothing about their account is kept. Those let in are saved with the characters on
 * their account and sent on (303 so a POST turns into a GET): to the grid, or to the character picker while
 * they have no active character yet. Database failures get their own error, so they are not mistaken for
 * Battle.net problems.
 */
export async function finishSignIn(
  bnetId: string,
  battletag: string,
  characters: BnetCharacter[],
): Promise<NextResponse> {
  try {
    if (!isAdminBattletag(battletag)) {
      await refreshGuildIfStale(SIGN_IN_MAX_AGE_MS);
      if (!(await anyOnTeam(characters))) {
        await forgetUser(bnetId);
        const res = loginError("team");
        res.cookies.set({
          name: REFUSED_COOKIE,
          value: battletag,
          httpOnly: true,
          sameSite: "lax",
          secure: secureCookies(),
          path: "/login",
          maxAge: 600,
        });
        return res;
      }
    }

    const userId = await upsertUser(bnetId, battletag);
    await syncAccountCharacters(userId, characters);
    const next = (await hasActiveCharacter(userId)) ? "/" : "/characters";
    const { token, expires } = await createSession(userId);
    const res = NextResponse.redirect(appUrl(next), 303);
    res.cookies.set(sessionCookie(token, expires));
    res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/auth", maxAge: 0 });
    res.cookies.set({ name: REFUSED_COOKIE, value: "", path: "/login", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("Sign-in could not be saved to the database", err);
    return loginError("db");
  }
}

export function loginError(code: string): NextResponse {
  return NextResponse.redirect(appUrl(`/login?error=${encodeURIComponent(code)}`), 303);
}
