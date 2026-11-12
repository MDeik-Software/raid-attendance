import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { exchangeCode, fetchAccount, fetchCharacters } from "@/lib/bnet";
import { STATE_COOKIE, finishSignIn, loginError } from "@/lib/auth-cookies";
import type { Region } from "@/lib/regions";
import { playerRegion } from "@/lib/repo";

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

  const region = await playerRegion().catch((err) => {
    console.error("Sign-in could not read the settings from the database", err);
    return null;
  });
  if (!region) return loginError("db");

  const bnet = await fetchFromBattleNet(code, region).catch((err) => {
    console.error("Battle.net sign-in failed", err);
    return null;
  });
  if (!bnet) return loginError("bnet");

  return finishSignIn(bnet.account.id, bnet.account.battletag, bnet.characters);
}

async function fetchFromBattleNet(code: string, region: Region) {
  const accessToken = await exchangeCode(code);
  const [account, characters] = await Promise.all([
    fetchAccount(accessToken),
    fetchCharacters(accessToken, region),
  ]);
  return { account, characters };
}
