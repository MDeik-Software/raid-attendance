import "server-only";
import { fetchCharacterData, type CharacterData } from "./bnet";
import { bnetConfigured } from "./config";
import { all, run } from "./db";
import type { Region } from "./regions";
import type { Member } from "./repo";

/** How long a cached sheet is shown before the home page fetches it again. */
export const PROFILE_MAX_AGE_MS = 30 * 60_000;
/** Team members' sheets (for the team average and the enchant check) are refreshed in the background. */
export const TEAM_PROFILE_MAX_AGE_MS = 6 * 3_600_000;

export type ProfileItem = {
  slot: string;
  slotName: string;
  itemId: number;
  name: string;
  quality: string;
  level: number;
  bonusIds: number[];
  /** Blizzard item class: 2 is a weapon, 4 armour (shields and off-hand frills are armour). */
  itemClassId: number | null;
  /** Permanent enchants as Blizzard describes them, without the "Enchanted:" prefix. */
  enchants: string[];
  sockets: { filled: boolean; gem: string | null }[];
};

export type ProfileSet = { name: string; equipped: number; total: number; bonuses: { count: number; active: boolean }[] };

export type CharacterProfile = {
  name: string;
  realmName: string;
  level: number;
  classId: number;
  specName: string | null;
  heroTree: string | null;
  equippedItemLevel: number;
  lastLogin: number | null;
  media: { avatar: string | null; inset: string | null; main: string | null };
  stats: {
    primary: { name: string; value: number } | null;
    crit: number | null;
    haste: number | null;
    mastery: number | null;
    versatility: number | null;
  };
  items: ProfileItem[];
  sets: ProfileSet[];
  loadoutCode: string | null;
};

export type LoadedProfile = {
  profile: CharacterProfile | null;
  fetchedAt: string | null;
  /** Why there is no fresh sheet: Battle.net is not set up here, does not know the character, or failed. */
  problem: "not-configured" | "not-found" | "unavailable" | null;
};

// ---------- reading Blizzard's responses ----------

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Display strings carry WoW UI markup (colours, atlas and texture icons); keep the plain text. */
export function plainText(s: string): string {
  return s
    .replace(/\|c[0-9a-fA-F]{8}/g, "")
    .replace(/\|cn[^:|]*:/g, "")
    .replace(/\|r/g, "")
    .replace(/\|A:[^|]*\|a/g, "")
    .replace(/\|T[^|]*\|t/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function best(...values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  return known.length ? Math.max(...known) : null;
}

function readItem(raw: unknown): ProfileItem | null {
  const it = obj(raw);
  const slot = str(obj(it.slot).type);
  if (!slot) return null;
  return {
    slot,
    slotName: str(obj(it.slot).name) ?? slot,
    itemId: num(obj(it.item).id) ?? 0,
    name: str(it.name) ?? "Unknown item",
    quality: str(obj(it.quality).type) ?? "COMMON",
    level: num(obj(it.level).value) ?? 0,
    bonusIds: arr(it.bonus_list).filter((b): b is number => typeof b === "number"),
    itemClassId: num(obj(it.item_class).id),
    enchants: arr(it.enchantments)
      .map(obj)
      .filter((e) => {
        const s = obj(e.enchantment_slot);
        return s.type === "PERMANENT" || s.id === 0;
      })
      .map((e) => plainText(str(e.display_string) ?? "").replace(/^Enchanted:\s*/i, ""))
      .filter(Boolean),
    sockets: arr(it.sockets).map((s) => {
      const gem = str(obj(obj(s).item).name);
      return { filled: gem != null, gem };
    }),
  };
}

export function toProfile(data: CharacterData): CharacterProfile {
  const s = data.summary;
  const eq = obj(data.equipment);
  const spec = obj(data.specializations);
  const st = obj(data.statistics);
  const assets = arr(obj(data.media).assets).map(obj);
  const asset = (key: string) => str(assets.find((a) => a.key === key)?.value);

  const activeSpecId = num(obj(spec.active_specialization).id);
  const activeSpec = arr(spec.specializations)
    .map(obj)
    .find((x) => num(obj(x.specialization).id) === activeSpecId);
  const loadout = arr(activeSpec?.loadouts).map(obj).find((l) => l.is_active === true);

  const rating = (key: string) => num(obj(st[key]).value);
  const primaries = (["strength", "agility", "intellect"] as const)
    .map((key) => ({ name: key[0].toUpperCase() + key.slice(1), value: num(obj(st[key]).effective) ?? 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    name: str(s.name) ?? "",
    realmName: str(obj(s.realm).name) ?? "",
    level: num(s.level) ?? 0,
    classId: num(obj(s.character_class).id) ?? 0,
    specName: str(obj(s.active_spec).name) ?? str(obj(spec.active_specialization).name),
    heroTree: str(obj(spec.active_hero_talent_tree).name),
    equippedItemLevel: num(s.equipped_item_level) ?? 0,
    lastLogin: num(s.last_login_timestamp),
    media: { avatar: asset("avatar"), inset: asset("inset"), main: asset("main-raw") ?? asset("main") },
    stats: {
      primary: primaries[0].value > 0 ? primaries[0] : null,
      crit: best(rating("melee_crit"), rating("spell_crit"), rating("ranged_crit")),
      haste: best(rating("melee_haste"), rating("spell_haste"), rating("ranged_haste")),
      mastery: rating("mastery"),
      versatility: num(st.versatility_damage_done_bonus),
    },
    items: arr(eq.equipped_items)
      .map(readItem)
      .filter((i): i is ProfileItem => i != null),
    sets: arr(eq.equipped_item_sets)
      .map(obj)
      .map((set) => ({
        name: str(obj(set.item_set).name) ?? "Set",
        equipped: arr(set.items).filter((i) => obj(i).is_equipped === true).length,
        total: arr(set.items).length,
        bonuses: arr(set.effects)
          .map(obj)
          .map((e) => ({ count: num(e.required_count) ?? 0, active: e.is_active === true })),
      })),
    loadoutCode: str(loadout?.talent_loadout_code),
  };
}

// ---------- cache ----------

type Cached = { profile: CharacterProfile | null; fetchedAt: string };

const keyOf = (m: { realmSlug: string; characterId: number }) => `${m.realmSlug}:${m.characterId}`;

export async function cachedProfiles(members: Member[]): Promise<Map<string, Cached>> {
  const wanted = new Set(members.map(keyOf));
  const rows = await all<{ realmSlug: string; characterId: number; fetchedAt: string; data: string }>(
    "SELECT realm_slug AS realmSlug, character_id AS characterId, fetched_at AS fetchedAt, data FROM character_profiles",
  );
  const out = new Map<string, Cached>();
  for (const r of rows) {
    const key = keyOf(r);
    if (wanted.has(key)) out.set(key, { profile: JSON.parse(r.data) as CharacterProfile | null, fetchedAt: r.fetchedAt });
  }
  return out;
}

async function fetchAndStore(member: Member, region: Region): Promise<Cached> {
  const data = await fetchCharacterData(region, member.realmSlug, member.name);
  const profile = data ? toProfile(data) : null;
  const fetchedAt = new Date().toISOString();
  await run(
    `INSERT INTO character_profiles (realm_slug, character_id, fetched_at, data) VALUES (?, ?, ?, ?)
     ON CONFLICT(realm_slug, character_id) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data`,
    [member.realmSlug, member.characterId, fetchedAt, JSON.stringify(profile)],
  );
  return { profile, fetchedAt };
}

const isFresh = (c: Cached | undefined, maxAgeMs: number) =>
  c != null && Date.now() - Date.parse(c.fetchedAt) < maxAgeMs;

/** The character's sheet: from the cache while fresh, otherwise from Battle.net (falling back to the cache). */
export async function loadProfile(member: Member, region: Region): Promise<LoadedProfile> {
  const cached = (await cachedProfiles([member])).get(keyOf(member));
  if (isFresh(cached, PROFILE_MAX_AGE_MS)) {
    return { profile: cached!.profile, fetchedAt: cached!.fetchedAt, problem: cached!.profile ? null : "not-found" };
  }
  if (!bnetConfigured()) {
    return { profile: cached?.profile ?? null, fetchedAt: cached?.fetchedAt ?? null, problem: "not-configured" };
  }
  try {
    const fresh = await fetchAndStore(member, region);
    return { profile: fresh.profile, fetchedAt: fresh.fetchedAt, problem: fresh.profile ? null : "not-found" };
  } catch (err) {
    console.error(`Character sheet for ${member.name} could not be fetched`, err);
    return { profile: cached?.profile ?? null, fetchedAt: cached?.fetchedAt ?? null, problem: "unavailable" };
  }
}

let refreshing: Promise<void> | null = null;

/**
 * Fetches up to `limit` team members whose sheets are missing or older than maxAgeMs, a few at a time. Runs
 * after the response, so it only keeps the team average and the enchant check current; failures are logged.
 */
export function refreshTeamProfiles(team: Member[], region: Region, maxAgeMs: number, limit: number): Promise<void> {
  refreshing ??= (async () => {
    try {
      if (!bnetConfigured()) return;
      const cached = await cachedProfiles(team);
      const stale = team.filter((m) => !isFresh(cached.get(keyOf(m)), maxAgeMs)).slice(0, limit);
      for (let i = 0; i < stale.length; i += 4) {
        await Promise.all(
          stale.slice(i, i + 4).map((m) =>
            fetchAndStore(m, region).catch((err) => console.error(`Character sheet for ${m.name} failed`, err)),
          ),
        );
      }
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export { keyOf as profileKey };
