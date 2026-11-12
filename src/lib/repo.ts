import "server-only";
import type { InStatement } from "@libsql/client";
import type { BnetGuildMember } from "./bnet";
import { config } from "./config";
import { all, batch, first, run } from "./db";
import { weekday } from "./dates";
import { isRegion, type Region } from "./regions";
import type { Status } from "./status";

export const DEFAULT_MAX_LEVEL = 90;

export type GuildSettings = {
  region: Region;
  realmSlug: string;
  realmName: string;
  name: string;
  fetchedAt: string;
};

export type Settings = {
  startDate: string;
  endDate: string;
  raidDays: number[];
  defaultYesDays: number[];
  /** Only characters at this level are offered to players and to the raid team. */
  maxLevel: number;
  guild: GuildSettings | null;
  /** Guild ranks whose max-level members are on the raid team unless an officer says otherwise. */
  raidRanks: number[];
  /** Officer-given names for rank numbers; Blizzard only reports the numbers. */
  rankNames: Record<string, string>;
};

/** A character from the imported guild roster, with the player who claimed it (if any). */
export type Member = {
  id: number;
  realmSlug: string;
  characterId: number;
  name: string;
  classId: number;
  level: number;
  rank: number;
  inGuild: boolean;
  /** null: follow the raid ranks; true/false: an officer put the character on or off the team. */
  teamOverride: boolean | null;
  groupNo: number;
  ownerUserId: number | null;
  ownerBattletag: string | null;
};

// ---------- settings ----------

export async function getSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const json = <T>(key: string, fallback: T): T => {
    const value = map.get(key);
    return value ? (JSON.parse(value) as T) : fallback;
  };

  const region = map.get("guild_region");
  const realmSlug = map.get("guild_realm_slug");
  const name = map.get("guild_name");
  const maxLevel = Number(map.get("max_level"));

  return {
    startDate: map.get("start_date") ?? "",
    endDate: map.get("end_date") ?? "",
    raidDays: json("raid_days", []),
    defaultYesDays: json("default_yes_days", []),
    maxLevel: Number.isInteger(maxLevel) && maxLevel > 0 ? maxLevel : DEFAULT_MAX_LEVEL,
    guild:
      isRegion(region) && realmSlug && name
        ? {
            region,
            realmSlug,
            realmName: map.get("guild_realm_name") ?? realmSlug,
            name,
            fetchedAt: map.get("guild_fetched_at") ?? "",
          }
        : null,
    raidRanks: json("raid_ranks", []),
    rankNames: json("rank_names", {}),
  };
}

function settingStatements(values: Record<string, string>): InStatement[] {
  return Object.entries(values).map(([key, value]) => ({
    sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [key, value],
  }));
}

export async function saveSchedule(s: Pick<Settings, "startDate" | "endDate" | "raidDays" | "defaultYesDays">) {
  await batch(
    settingStatements({
      start_date: s.startDate,
      end_date: s.endDate,
      raid_days: JSON.stringify(s.raidDays),
      default_yes_days: JSON.stringify(s.defaultYesDays),
    }),
  );
}

export async function saveRanks(raidRanks: number[], rankNames: Record<string, string>, maxLevel: number) {
  await batch(
    settingStatements({
      raid_ranks: JSON.stringify(raidRanks),
      rank_names: JSON.stringify(rankNames),
      max_level: String(maxLevel),
    }),
  );
}

/** What a cell shows when nobody has answered it yet. */
export function defaultStatus(date: string, settings: Settings): Status {
  return settings.defaultYesDays.includes(weekday(date)) ? "yes" : "unset";
}

export function rankLabel(rank: number, settings: Settings): string {
  return settings.rankNames[rank] || (rank === 0 ? "Guild Master" : `Rank ${rank}`);
}

/** Players' characters are read from the guild's region; BNET_REGION only counts until a guild is imported. */
export async function playerRegion(): Promise<Region> {
  const settings = await getSettings();
  if (settings.guild) return settings.guild.region;
  return isRegion(config.bnetRegion) ? config.bnetRegion : "eu";
}

// ---------- guild members and the raid team ----------

type MemberRow = Omit<Member, "inGuild" | "teamOverride"> & { inGuild: number; teamOverride: number | null };

// A character is claimed by the player who has it on their account and ticked it as active.
const MEMBER_SELECT = `
  SELECT g.id, g.realm_slug AS realmSlug, g.character_id AS characterId, g.name, g.class_id AS classId,
         g.level, g.guild_rank AS rank, g.in_guild AS inGuild, g.team_override AS teamOverride,
         g.group_no AS groupNo, c.user_id AS ownerUserId, u.battletag AS ownerBattletag
  FROM guild_members g
  LEFT JOIN user_characters c
    ON c.realm_slug = g.realm_slug AND c.character_id = g.character_id AND c.active = 1
  LEFT JOIN users u ON u.id = c.user_id`;

function toMember(row: MemberRow): Member {
  return {
    ...row,
    inGuild: row.inGuild === 1,
    teamOverride: row.teamOverride == null ? null : row.teamOverride === 1,
  };
}

/** Every imported guild member, by rank and then name. */
export async function listMembers(): Promise<Member[]> {
  const rows = await all<MemberRow>(MEMBER_SELECT);
  return rows.map(toMember).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

export async function getMember(id: number): Promise<Member | undefined> {
  const row = await first<MemberRow>(`${MEMBER_SELECT} WHERE g.id = ?`, [id]);
  return row && toMember(row);
}

/** The imported guild members that are characters on the user's Battle.net account, ticked or not. */
export async function listAccountMembers(userId: number): Promise<Member[]> {
  const rows = await all<MemberRow>(
    `${MEMBER_SELECT}
     WHERE EXISTS (SELECT 1 FROM user_characters a
                   WHERE a.user_id = ? AND a.realm_slug = g.realm_slug AND a.character_id = g.character_id)`,
    [userId],
  );
  return rows.map(toMember);
}

/** Whether the character belongs on the team by the rank and level rules alone. */
export function teamByDefault(m: Member, settings: Settings): boolean {
  return m.inGuild && settings.raidRanks.includes(m.rank) && m.level >= settings.maxLevel;
}

export function isOnTeam(m: Member, settings: Settings): boolean {
  return m.teamOverride ?? teamByDefault(m, settings);
}

/** The raid team as the grid shows it: by block, then name. */
export async function listTeam(settings: Settings): Promise<Member[]> {
  return (await listMembers())
    .filter((m) => isOnTeam(m, settings))
    .sort((a, b) => a.groupNo - b.groupNo || a.name.localeCompare(b.name));
}

/**
 * Stores a freshly fetched guild roster. Importing a different guild than before starts over: the old
 * members, their answers and the rank choices go. Members who left the guild keep their row only while
 * an officer has them on the team explicitly; the rest are removed together with their answers.
 * Returns whether it was the same guild as before.
 */
export async function importGuild(
  guild: Omit<GuildSettings, "fetchedAt">,
  members: BnetGuildMember[],
): Promise<boolean> {
  const settings = await getSettings();
  const sameGuild =
    settings.guild?.region === guild.region &&
    settings.guild.realmSlug === guild.realmSlug &&
    settings.guild.name.toLowerCase() === guild.name.toLowerCase();

  const statements: InStatement[] = [];
  if (sameGuild) {
    const fetched = new Set(members.map((m) => `${m.realmSlug}:${m.id}`));
    for (const m of await listMembers()) {
      if (fetched.has(`${m.realmSlug}:${m.characterId}`)) continue;
      if (m.teamOverride === true) {
        statements.push({ sql: "UPDATE guild_members SET in_guild = 0 WHERE id = ?", args: [m.id] });
      } else {
        statements.push(
          { sql: "DELETE FROM availability WHERE member_id = ?", args: [m.id] },
          { sql: "DELETE FROM guild_members WHERE id = ?", args: [m.id] },
        );
      }
    }
  } else {
    statements.push("DELETE FROM availability", "DELETE FROM guild_members");
  }

  for (let i = 0; i < members.length; i += 100) {
    const chunk = members.slice(i, i + 100);
    statements.push({
      sql: `INSERT INTO guild_members (realm_slug, character_id, name, class_id, level, guild_rank, in_guild)
            VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, 1)").join(", ")}
            ON CONFLICT(realm_slug, character_id) DO UPDATE SET
              name = excluded.name, class_id = excluded.class_id, level = excluded.level,
              guild_rank = excluded.guild_rank, in_guild = 1`,
      args: chunk.flatMap((m) => [m.realmSlug, m.id, m.name, m.classId, m.level, m.rank]),
    });
  }

  statements.push(
    ...settingStatements({
      guild_region: guild.region,
      guild_realm_slug: guild.realmSlug,
      guild_realm_name: guild.realmName,
      guild_name: guild.name,
      guild_fetched_at: new Date().toISOString(),
      ...(sameGuild ? {} : { raid_ranks: "[]", rank_names: "{}" }),
    }),
  );

  await batch(statements);
  return sameGuild;
}

export type TeamChange = { id: number; override: boolean | null; groupNo: number };

/** Saves the officers' on/off choices and blocks; members who left the guild and are off the team go. */
export async function saveTeam(changes: TeamChange[]) {
  const gone = "SELECT id FROM guild_members WHERE in_guild = 0 AND team_override IS NOT 1";
  await batch([
    ...changes.map((c) => ({
      sql: "UPDATE guild_members SET team_override = ?, group_no = ? WHERE id = ?",
      args: [c.override == null ? null : c.override ? 1 : 0, c.groupNo, c.id],
    })),
    `DELETE FROM availability WHERE member_id IN (${gone})`,
    `DELETE FROM guild_members WHERE id IN (${gone})`,
  ]);
}

// ---------- availability ----------

export function listAvailability(from: string, to: string) {
  return all<{ memberId: number; date: string; status: Status }>(
    "SELECT member_id AS memberId, date, status FROM availability WHERE date BETWEEN ? AND ?",
    [from, to],
  );
}

export async function setAvailability(memberId: number, date: string, status: Status, userId: number) {
  await run(
    `INSERT INTO availability (member_id, date, status, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(member_id, date) DO UPDATE SET
       status = excluded.status,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = excluded.updated_at`,
    [memberId, date, status, userId, new Date().toISOString()],
  );
}

// ---------- users ----------

export async function upsertUser(bnetId: string, battletag: string): Promise<number> {
  const now = new Date().toISOString();
  const row = await first<{ id: number }>(
    `INSERT INTO users (bnet_id, battletag, created_at, last_login_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(bnet_id) DO UPDATE SET battletag = excluded.battletag, last_login_at = excluded.last_login_at
     RETURNING id`,
    [bnetId, battletag, now, now],
  );
  if (!row) throw new Error("Could not save the user");
  return row.id;
}

/**
 * Removes everything stored about a Battle.net account: its sessions, its characters and the user row.
 * Answers it once gave stay on the grid without the name of who gave them.
 */
export async function forgetUser(bnetId: string) {
  const user = "SELECT id FROM users WHERE bnet_id = ?";
  await batch([
    { sql: `DELETE FROM sessions WHERE user_id IN (${user})`, args: [bnetId] },
    { sql: `DELETE FROM user_characters WHERE user_id IN (${user})`, args: [bnetId] },
    { sql: `UPDATE availability SET updated_by_user_id = NULL WHERE updated_by_user_id IN (${user})`, args: [bnetId] },
    { sql: "DELETE FROM users WHERE bnet_id = ?", args: [bnetId] },
  ]);
}

/** WoW names are unique per realm and case-insensitive; accents are significant. */
export function normaliseName(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("en");
}
