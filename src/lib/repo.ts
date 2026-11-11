import "server-only";
import { getDb, transaction } from "./db";
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

export function getSettings(): Settings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    startDate: map.get("start_date") ?? "",
    endDate: map.get("end_date") ?? "",
    raidDays: JSON.parse(map.get("raid_days") ?? "[]"),
    defaultYesDays: JSON.parse(map.get("default_yes_days") ?? "[]"),
  };
}

export function saveSettings(s: Settings) {
  const db = getDb();
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  transaction(db, () => {
    upsert.run("start_date", s.startDate);
    upsert.run("end_date", s.endDate);
    upsert.run("raid_days", JSON.stringify(s.raidDays));
    upsert.run("default_yes_days", JSON.stringify(s.defaultYesDays));
  });
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

export function listRoster(): RosterCharacter[] {
  return getDb()
    .prepare(`${ROSTER_SELECT} ORDER BY r.group_no, r.sort_order, r.id`)
    .all() as unknown as RosterCharacter[];
}

export function getRosterCharacter(id: number): RosterCharacter | undefined {
  return getDb().prepare(`${ROSTER_SELECT} WHERE r.id = ?`).get(id) as RosterCharacter | undefined;
}

export function nameTaken(name: string, exceptId?: number): boolean {
  const key = normaliseName(name);
  return listRoster().some((c) => c.id !== exceptId && normaliseName(c.name) === key);
}

export function addCharacter(name: string, classId: number, groupNo: number) {
  const db = getDb();
  const { next } = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM roster_characters").get() as {
    next: number;
  };
  db.prepare(
    "INSERT INTO roster_characters (name, class_id, group_no, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(name, classId, groupNo, next, new Date().toISOString());
}

export function updateCharacter(id: number, name: string, classId: number, groupNo: number) {
  getDb()
    .prepare("UPDATE roster_characters SET name = ?, class_id = ?, group_no = ? WHERE id = ?")
    .run(name, classId, groupNo, id);
}

/** Swaps the character with its neighbour inside the same block. */
export function moveCharacter(id: number, direction: "up" | "down") {
  const db = getDb();
  transaction(db, () => {
    const roster = listRoster();
    const index = roster.findIndex((c) => c.id === id);
    if (index < 0) return;
    const neighbour = roster[direction === "up" ? index - 1 : index + 1];
    const self = roster[index];
    if (!neighbour || neighbour.groupNo !== self.groupNo) return;
    // Rewrite the block's order so equal sort_order values can never get stuck.
    const block = roster.filter((c) => c.groupNo === self.groupNo);
    const a = block.indexOf(self);
    const b = block.indexOf(neighbour);
    [block[a], block[b]] = [block[b], block[a]];
    const base = Math.min(...block.map((c) => c.sortOrder));
    const update = db.prepare("UPDATE roster_characters SET sort_order = ? WHERE id = ?");
    block.forEach((c, i) => update.run(base + i, c.id));
  });
}

/** Forgets which Battle.net character owns the row; the next sign-in with that name claims it again. */
export function resetClaim(id: number) {
  getDb()
    .prepare(
      "UPDATE roster_characters SET realm_slug = NULL, bnet_character_id = NULL, owner_user_id = NULL WHERE id = ?",
    )
    .run(id);
}

export function removeCharacter(id: number) {
  getDb().prepare("DELETE FROM roster_characters WHERE id = ?").run(id);
}

// ---------- availability ----------

export function listAvailability(from: string, to: string) {
  return getDb()
    .prepare(
      "SELECT roster_character_id AS characterId, date, status FROM availability WHERE date BETWEEN ? AND ?",
    )
    .all(from, to) as { characterId: number; date: string; status: Status }[];
}

export function setAvailability(characterId: number, date: string, status: Status, userId: number) {
  getDb()
    .prepare(
      `INSERT INTO availability (roster_character_id, date, status, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(roster_character_id, date) DO UPDATE SET
         status = excluded.status,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
    )
    .run(characterId, date, status, userId, new Date().toISOString());
}

// ---------- users ----------

export function upsertUser(bnetId: string, battletag: string): number {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (bnet_id, battletag, created_at, last_login_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(bnet_id) DO UPDATE SET battletag = excluded.battletag, last_login_at = excluded.last_login_at`,
  ).run(bnetId, battletag, now, now);
  const { id } = db.prepare("SELECT id FROM users WHERE bnet_id = ?").get(bnetId) as { id: number };
  return id;
}

/** WoW names are unique per realm and case-insensitive; accents are significant. */
export function normaliseName(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("en");
}
