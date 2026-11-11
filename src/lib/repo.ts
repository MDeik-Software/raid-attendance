import "server-only";
import { all, batch, first, run } from "./db";
import { weekday } from "./dates";
import type { Status } from "./status";

export type Settings = {
  startDate: string;
  endDate: string;
  raidDays: number[];
  defaultYesDays: number[];
};

export type RosterCharacter = {
  id: number;
  name: string;
  classId: number;
  groupNo: number;
  sortOrder: number;
  realmSlug: string | null;
  bnetCharacterId: number | null;
  ownerUserId: number | null;
  ownerBattletag: string | null;
};

// ---------- settings ----------

export async function getSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    startDate: map.get("start_date") ?? "",
    endDate: map.get("end_date") ?? "",
    raidDays: JSON.parse(map.get("raid_days") ?? "[]"),
    defaultYesDays: JSON.parse(map.get("default_yes_days") ?? "[]"),
  };
}

export async function saveSettings(s: Settings) {
  const upsert = (key: string, value: string) => ({
    sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [key, value],
  });
  await batch([
    upsert("start_date", s.startDate),
    upsert("end_date", s.endDate),
    upsert("raid_days", JSON.stringify(s.raidDays)),
    upsert("default_yes_days", JSON.stringify(s.defaultYesDays)),
  ]);
}

/** What a cell shows when nobody has answered it yet. */
export function defaultStatus(date: string, settings: Settings): Status {
  return settings.defaultYesDays.includes(weekday(date)) ? "yes" : "unset";
}

// ---------- roster ----------

const ROSTER_SELECT = `
  SELECT r.id, r.name, r.class_id AS classId, r.group_no AS groupNo, r.sort_order AS sortOrder,
         r.realm_slug AS realmSlug, r.bnet_character_id AS bnetCharacterId,
         r.owner_user_id AS ownerUserId, u.battletag AS ownerBattletag
  FROM roster_characters r
  LEFT JOIN users u ON u.id = r.owner_user_id`;

export function listRoster(): Promise<RosterCharacter[]> {
  return all<RosterCharacter>(`${ROSTER_SELECT} ORDER BY r.group_no, r.sort_order, r.id`);
}

export function getRosterCharacter(id: number): Promise<RosterCharacter | undefined> {
  return first<RosterCharacter>(`${ROSTER_SELECT} WHERE r.id = ?`, [id]);
}

export async function nameTaken(name: string, exceptId?: number): Promise<boolean> {
  const key = normaliseName(name);
  return (await listRoster()).some((c) => c.id !== exceptId && normaliseName(c.name) === key);
}

export async function addCharacter(name: string, classId: number, groupNo: number) {
  await run(
    `INSERT INTO roster_characters (name, class_id, group_no, sort_order, created_at)
     SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, ? FROM roster_characters`,
    [name, classId, groupNo, new Date().toISOString()],
  );
}

export async function updateCharacter(id: number, name: string, classId: number, groupNo: number) {
  await run("UPDATE roster_characters SET name = ?, class_id = ?, group_no = ? WHERE id = ?", [
    name,
    classId,
    groupNo,
    id,
  ]);
}

/** Swaps the character with its neighbour inside the same block. */
export async function moveCharacter(id: number, direction: "up" | "down") {
  const roster = await listRoster();
  const index = roster.findIndex((c) => c.id === id);
  if (index < 0) return;
  const self = roster[index];
  const neighbour = roster[direction === "up" ? index - 1 : index + 1];
  if (!neighbour || neighbour.groupNo !== self.groupNo) return;

  // Rewrite the block's order so equal sort_order values can never get stuck.
  const block = roster.filter((c) => c.groupNo === self.groupNo);
  const a = block.indexOf(self);
  const b = block.indexOf(neighbour);
  [block[a], block[b]] = [block[b], block[a]];
  const base = Math.min(...block.map((c) => c.sortOrder));
  await batch(
    block.map((c, i) => ({ sql: "UPDATE roster_characters SET sort_order = ? WHERE id = ?", args: [base + i, c.id] })),
  );
}

/** Forgets which Battle.net character owns the row; the next sign-in with that name claims it again. */
export async function resetClaim(id: number) {
  await run(
    "UPDATE roster_characters SET realm_slug = NULL, bnet_character_id = NULL, owner_user_id = NULL WHERE id = ?",
    [id],
  );
}

export async function removeCharacter(id: number) {
  await batch([
    { sql: "DELETE FROM availability WHERE roster_character_id = ?", args: [id] },
    { sql: "DELETE FROM roster_characters WHERE id = ?", args: [id] },
  ]);
}

// ---------- availability ----------

export function listAvailability(from: string, to: string) {
  return all<{ characterId: number; date: string; status: Status }>(
    "SELECT roster_character_id AS characterId, date, status FROM availability WHERE date BETWEEN ? AND ?",
    [from, to],
  );
}

export async function setAvailability(characterId: number, date: string, status: Status, userId: number) {
  await run(
    `INSERT INTO availability (roster_character_id, date, status, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(roster_character_id, date) DO UPDATE SET
       status = excluded.status,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = excluded.updated_at`,
    [characterId, date, status, userId, new Date().toISOString()],
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

/** WoW names are unique per realm and case-insensitive; accents are significant. */
export function normaliseName(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("en");
}
