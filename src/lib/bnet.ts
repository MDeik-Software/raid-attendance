import "server-only";
import { config } from "./config";

/** One WoW character on the signed-in Battle.net account. */
export type BnetCharacter = {
  id: number;
  name: string;
  realmSlug: string;
  classId: number | null;
};

const OAUTH = "https://oauth.battle.net";

export function redirectUri(): string {
  return `${config.appUrl}/api/auth/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.bnetClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid wow.profile",
    state,
  });
  return `${OAUTH}/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const basic = Buffer.from(`${config.bnetClientId}:${config.bnetClientSecret}`).toString("base64");
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Battle.net token exchange failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Battle.net token response had no access_token");
  return json.access_token;
}

export async function fetchAccount(accessToken: string): Promise<{ id: string; battletag: string }> {
  const res = await fetch(`${OAUTH}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Battle.net userinfo failed: HTTP ${res.status}`);
  const json = (await res.json()) as { id?: number | string; sub?: string; battletag?: string };
  const id = String(json.id ?? json.sub ?? "");
  if (!id) throw new Error("Battle.net userinfo had no account id");
  return { id, battletag: json.battletag ?? `Player#${id}` };
}

type ProfileResponse = {
  wow_accounts?: {
    characters?: {
      id: number;
      name: string;
      realm?: { slug?: string };
      playable_class?: { id?: number };
    }[];
  }[];
};

/** Every WoW character on the account (all WoW licenses), from the Profile API. */
export async function fetchCharacters(accessToken: string): Promise<BnetCharacter[]> {
  const region = config.bnetRegion;
  const locale = region === "eu" ? "en_GB" : "en_US";
  const url = `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-${region}&locale=${locale}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (res.status === 404) return []; // account has no WoW characters in this region
  if (!res.ok) throw new Error(`Battle.net profile request failed: HTTP ${res.status}`);
  const json = (await res.json()) as ProfileResponse;
  return (json.wow_accounts ?? [])
    .flatMap((account) => account.characters ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      realmSlug: c.realm?.slug ?? "",
      classId: c.playable_class?.id ?? null,
    }));
}
