import "server-only";
import { NextResponse } from "next/server";
import { config } from "./config";
import { createSession, sessionCookie } from "./session";

export const STATE_COOKIE = "rr_oauth_state";

/** Absolute URL on this app, built from APP_URL so it is right behind a reverse proxy. */
export function appUrl(path: string): URL {
  return new URL(path, `${config.appUrl}/`);
}

/** Starts a session for the user and sends them to the grid (303 so a POST turns into a GET). */
export function signedInRedirect(userId: number): NextResponse {
  const { token, expires } = createSession(userId);
  const res = NextResponse.redirect(appUrl("/"), 303);
  res.cookies.set(sessionCookie(token, expires));
  res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/auth", maxAge: 0 });
  return res;
}

export function loginError(code: string): NextResponse {
  return NextResponse.redirect(appUrl(`/login?error=${encodeURIComponent(code)}`), 303);
}
