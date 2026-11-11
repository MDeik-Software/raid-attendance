import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { exchangeCode, fetchAccount, fetchCharacters } from "@/lib/bnet";
import { syncCharacters } from "@/lib/claims";
import { upsertUser } from "@/lib/repo";
import { STATE_COOKIE, loginError, signedInRedirect } from "@/lib/auth-cookies";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return loginError("denied");

  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || !sameState(state, expected)) return loginError("state");

  try {
    const accessToken = await exchangeCode(code);
    const [account, characters] = await Promise.all([fetchAccount(accessToken), fetchCharacters(accessToken)]);
    const userId = await upsertUser(account.id, account.battletag);
    await syncCharacters(userId, characters);
    return await signedInRedirect(userId);
  } catch (err) {
    console.error("Battle.net sign-in failed", err);
    return loginError("bnet");
  }
}
