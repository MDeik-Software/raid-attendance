import "server-only";
import { config } from "./config";
import type { Region } from "./regions";

/** One WoW character on the signed-in Battle.net account. */
export type BnetCharacter = {
  id: number;
  name: string;
  realmSlug: string;
  realmName: string;
  classId: number | null;
  level: number;
};

/** One character in a guild roster. Blizzard only reports rank numbers (0 = Guild Master), not rank names. */
export type BnetGuildMember = {
  id: number;
  name: string;
  realmSlug: string;
  classId: number;
  level: number;
  rank: number;
};

export type Realm = { slug: string; name: string };

const OAUTH = "https://oauth.battle.net";

/**
 * Battle.net's own sign-out page. Battle.net keeps people signed in and sends the same account straight back
 * to the app, so switching to another Battle.net account needs a sign-out there first. Its "ref" parameter
 * continues to another page afterwards, but only to Battle.net's own sites.
 */
export const BNET_SIGN_OUT_URL = "https://account.battle.net/login/logout";

function apiUrl(region: Region, path: string, namespace: "profile" | "dynamic"): string {
  const locale = region === "eu" ? "en_GB" : "en_US";
  const sep = path.includes("?") ? "&" : "?";
  return `https://${region}.api.blizzard.com${path}${sep}namespace=${namespace}-${region}&locale=${locale}`;
}

function clientAuth(): string {
  return `Basic ${Buffer.from(`${config.bnetClientId}:${config.bnetClientSecret}`).toString("base64")}`;
}

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

/**
 * Sign-in with another Battle.net account: Battle.net's sign-out, continuing to its sign-in page for this app.
 * Battle.net only continues to its own sites, which its sign-in page is; once signed out, that page asks for
 * an account, and the sign-in comes back to the callback as usual.
 */
export function switchAccountUrl(state: string): string {
  return `${BNET_SIGN_OUT_URL}?${new URLSearchParams({ ref: authorizeUrl(state) })}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: clientAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Battle.net token exchange failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Battle.net token response had no access_token");
  return json.access_token;
}

// The app's own token (client credentials) for guild and realm data; it lasts a day, so it is reused.
let appToken: { value: string; expiresAt: number } | undefined;

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: clientAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Battle.net app token request failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Battle.net app token response had no access_token");
  appToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return appToken.value;
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
      level?: number;
      realm?: { slug?: string; name?: string };
      playable_class?: { id?: number };
    }[];
  }[];
};

/** Every WoW character on the account (all WoW licenses) in the region, from the Profile API. */
export async function fetchCharacters(accessToken: string, region: Region): Promise<BnetCharacter[]> {
  const res = await fetch(apiUrl(region, "/profile/user/wow", "profile"), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 404) return []; // account has no WoW characters in this region
  if (!res.ok) throw new Error(`Battle.net profile request failed: HTTP ${res.status}`);
  const json = (await res.json()) as ProfileResponse;
  return (json.wow_accounts ?? [])
    .flatMap((account) => account.characters ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      realmSlug: c.realm?.slug ?? "",
      realmName: c.realm?.name ?? c.realm?.slug ?? "",
      classId: c.playable_class?.id ?? null,
      level: c.level ?? 0,
    }));
}

// Realm lists hardly ever change; keep each region's list for a day.
const realmCache = new Map<Region, { realms: Realm[]; expiresAt: number }>();

// The realm index also lists Blizzard's internal and test realms ("EU1A Account Realm", "EU4A1-INST", "RDB EU").
const INTERNAL_REALM = /^(eu|us|kr|tw)\d|arena pass|account realm|-inst\b|^rdb\b|^zzz/i;

/** All playable realms of the region, sorted by name. */
export async function fetchRealms(region: Region): Promise<Realm[]> {
  const cached = realmCache.get(region);
  if (cached && cached.expiresAt > Date.now()) return cached.realms;

  const res = await fetch(apiUrl(region, "/data/wow/realm/index", "dynamic"), {
    headers: { Authorization: `Bearer ${await getAppToken()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Battle.net realm list request failed: HTTP ${res.status}`);
  const json = (await res.json()) as { realms?: { slug: string; name: string }[] };
  const realms = (json.realms ?? [])
    .filter((r) => !INTERNAL_REALM.test(r.name))
    .map((r) => ({ slug: r.slug, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  realmCache.set(region, { realms, expiresAt: Date.now() + 86_400_000 });
  return realms;
}

type RosterResponse = {
  guild?: { name?: string };
  members?: {
    rank: number;
    character: {
      id: number;
      name: string;
      level?: number;
      realm?: { slug?: string };
      playable_class?: { id?: number };
    };
  }[];
};

/** The guild's members, or null when Battle.net knows no such guild on that realm. */
export async function fetchGuildRoster(
  region: Region,
  realmSlug: string,
  guildName: string,
): Promise<{ name: string; members: BnetGuildMember[] } | null> {
  const nameSlug = guildName.trim().toLowerCase().replace(/\s+/g, "-");
  const path = `/data/wow/guild/${encodeURIComponent(realmSlug)}/${encodeURIComponent(nameSlug)}/roster`;
  const res = await fetch(apiUrl(region, path, "profile"), {
    headers: { Authorization: `Bearer ${await getAppToken()}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Battle.net guild roster request failed: HTTP ${res.status}`);
  const json = (await res.json()) as RosterResponse;
  return {
    name: json.guild?.name ?? guildName,
    members: (json.members ?? []).map((m) => ({
      id: m.character.id,
      name: m.character.name,
      realmSlug: m.character.realm?.slug ?? realmSlug,
      classId: m.character.playable_class?.id ?? 0,
      level: m.character.level ?? 0,
      rank: m.rank,
    })),
  };
}
