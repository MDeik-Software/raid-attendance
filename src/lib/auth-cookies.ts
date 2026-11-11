import "server-only";
import { NextResponse } from "next/server";
import type { BnetCharacter } from "./bnet";
import { syncCharacters } from "./claims";
import { config } from "./config";
import { upsertUser } from "./repo";
import { createSession, sessionCookie } from "./session";

export const STATE_COOKIE = "rr_oauth_state";

/** Absolute URL on this app, built from APP_URL so it is right behind a reverse proxy. */
export function appUrl(path: string): URL {
  return new URL(path, `${config.appUrl}/`);
}

/**
 * Saves the user and their character claims, starts a session and sends them to the grid
 * (303 so a POST turns into a GET). Database failures get their own error, so they are not
 * mistaken for Battle.net problems.
 */
export async function finishSignIn(
  bnetId: string,
  battletag: string,
  characters: BnetCharacter[],
): Promise<NextResponse> {
  try {
    const userId = await upsertUser(bnetId, battletag);
    await syncCharacters(userId, characters);
    const { token, expires } = await createSession(userId);
    const res = NextResponse.redirect(appUrl("/"), 303);
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
