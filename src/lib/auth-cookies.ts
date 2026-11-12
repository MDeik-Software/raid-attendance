import "server-only";
import { NextResponse } from "next/server";
import type { BnetCharacter } from "./bnet";
import { hasActiveCharacter, syncAccountCharacters } from "./claims";
import { config } from "./config";
import { upsertUser } from "./repo";
import { createSession, sessionCookie } from "./session";

export const STATE_COOKIE = "rr_oauth_state";

/** Absolute URL on this app, built from APP_URL so it is right behind a reverse proxy. */
export function appUrl(path: string): URL {
  return new URL(path, `${config.appUrl}/`);
}

/**
 * Saves the user and the characters on their account, starts a session and sends them on (303 so a POST
 * turns into a GET): to the grid, or to the character picker while they have no active character yet.
 * Database failures get their own error, so they are not mistaken for Battle.net problems.
 */
export async function finishSignIn(
  bnetId: string,
  battletag: string,
  characters: BnetCharacter[],
): Promise<NextResponse> {
  try {
    const userId = await upsertUser(bnetId, battletag);
    await syncAccountCharacters(userId, characters);
    const next = (await hasActiveCharacter(userId)) ? "/" : "/characters";
    const { token, expires } = await createSession(userId);
    const res = NextResponse.redirect(appUrl(next), 303);
    res.cookies.set(sessionCookie(token, expires));
    res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/auth", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("Sign-in could not be saved to the database", err);
    return loginError("db");
  }
}

export function loginError(code: string): NextResponse {
  return NextResponse.redirect(appUrl(`/login?error=${encodeURIComponent(code)}`), 303);
}
