import "server-only";
import crypto from "node:crypto";
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
/** Battle.net's ID token from a refused sign-in, kept briefly so "use a different account" can sign out there. */
export const ID_TOKEN_COOKIE = "rr_bnet_id";
/** Set while the player is away at Battle.net's sign-out, so the callback knows to start a fresh sign-in. */
export const SWITCH_COOKIE = "rr_switch";

const SHORT_COOKIE_SECONDS = 600;

/** Absolute URL on this app, built from APP_URL so it is right behind a reverse proxy. */
export function appUrl(path: string): URL {
  return new URL(path, `${config.appUrl}/`);
}

export function shortCookie(name: string, value: string, path: string) {
  return {
    name,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookies(),
    path,
    maxAge: SHORT_COOKIE_SECONDS,
  };
}

export function clearCookie(name: string, path: string) {
  return { name, value: "", path, maxAge: 0 };
}

export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Lets in officers and players with a raid team character on their account. Anyone else is turned away
 * without a session, and nothing about their account is kept on the server; their browser briefly keeps the
 * BattleTag (to say which account was refused) and Battle.net's ID token (to sign out there and switch).
 * Those let in are saved with the characters on their account and sent on (303 so a POST turns into a GET):
 * to the grid, or to the character picker while they have no active character yet. Database failures get
 * their own error, so they are not mistaken for Battle.net problems.
 */
export async function finishSignIn(
  bnetId: string,
  battletag: string,
  characters: BnetCharacter[],
  idToken: string | null = null,
): Promise<NextResponse> {
  try {
    if (!isAdminBattletag(battletag)) {
      await refreshGuildIfStale(SIGN_IN_MAX_AGE_MS);
      if (!(await anyOnTeam(characters))) {
        await forgetUser(bnetId);
        const res = loginError("team");
        res.cookies.set(shortCookie(REFUSED_COOKIE, battletag, "/login"));
        if (idToken) res.cookies.set(shortCookie(ID_TOKEN_COOKIE, idToken, "/api/auth"));
        return res;
      }
    }

    const userId = await upsertUser(bnetId, battletag);
    await syncAccountCharacters(userId, characters);
    const next = (await hasActiveCharacter(userId)) ? "/" : "/characters";
    const { token, expires } = await createSession(userId);
    const res = NextResponse.redirect(appUrl(next), 303);
    res.cookies.set(sessionCookie(token, expires));
    res.cookies.set(clearCookie(STATE_COOKIE, "/api/auth"));
    res.cookies.set(clearCookie(REFUSED_COOKIE, "/login"));
    res.cookies.set(clearCookie(ID_TOKEN_COOKIE, "/api/auth"));
    return res;
  } catch (err) {
    console.error("Sign-in could not be saved to the database", err);
    return loginError("db");
  }
}

/**
 * Battle.net sent the player back from its sign-out (see /api/auth/switch). If it went through, start a fresh
 * sign-in, where Battle.net now asks which account to use; otherwise explain the manual way.
 */
export function returnFromSignOut(params: URLSearchParams, expectedState: string): NextResponse {
  const state = params.get("state");
  const ok = !params.get("error") && (!state || sameState(state, expectedState));
  const res = ok ? NextResponse.redirect(appUrl("/api/auth/login"), 303) : loginError("switch");
  res.cookies.set(clearCookie(SWITCH_COOKIE, "/api/auth"));
  return res;
}

export function loginError(code: string): NextResponse {
  return NextResponse.redirect(appUrl(`/login?error=${encodeURIComponent(code)}`), 303);
}
