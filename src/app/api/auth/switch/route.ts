import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ID_TOKEN_COOKIE, SWITCH_COOKIE, clearCookie, loginError, shortCookie } from "@/lib/auth-cookies";
import { signOutUrl } from "@/lib/bnet";
import { bnetConfigured } from "@/lib/config";

/**
 * "Use a different Battle.net account" after a refused sign-in: signs the player out at Battle.net with the
 * ID token from that sign-in. Battle.net then sends them to the callback, which starts a fresh sign-in where
 * Battle.net asks for an account. Without the ID token (older than 10 minutes, or Battle.net sent none) the
 * sign-in page explains the manual way instead.
 */
export async function GET(req: NextRequest) {
  if (!bnetConfigured()) return loginError("not-configured");
  const idToken = req.cookies.get(ID_TOKEN_COOKIE)?.value;
  if (!idToken) return loginError("switch");

  const state = crypto.randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(signOutUrl(idToken, state));
  res.cookies.set(shortCookie(SWITCH_COOKIE, state, "/api/auth"));
  res.cookies.set(clearCookie(ID_TOKEN_COOKIE, "/api/auth"));
  return res;
}
