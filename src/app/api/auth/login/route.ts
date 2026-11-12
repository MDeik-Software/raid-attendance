import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/bnet";
import { bnetConfigured, secureCookies } from "@/lib/config";
import { STATE_COOKIE, SWITCH_COOKIE, clearCookie, loginError } from "@/lib/auth-cookies";

export async function GET() {
  if (!bnetConfigured()) return loginError("not-configured");

  const state = crypto.randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/api/auth",
    maxAge: 600,
  });
  // A new sign-in ends any account switch still waiting on Battle.net's sign-out.
  res.cookies.set(clearCookie(SWITCH_COOKIE, "/api/auth"));
  return res;
}
