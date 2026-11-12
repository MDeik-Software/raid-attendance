import "server-only";
import type { InStatement } from "@libsql/client";
import type { BnetCharacter } from "./bnet";
import { all, batch, first } from "./db";

/** A character on the player's Battle.net account, as stored at their last sign-in. */
export type AccountCharacter = {
  realmSlug: string;
  characterId: number;
  name: string;
  realmName: string;
  classId: number | null;
  level: number;
  active: boolean;
};

export function characterKey(c: { realmSlug: string; characterId: number }): string {
  return `${c.realmSlug}:${c.characterId}`;
}

/**
 * Stores the characters Battle.net reports for the account. A character moves with its owner: if another
 * player had it before, it is theirs no more and starts inactive here. Characters that left the account are
 * forgotten, which also releases the raid team rows they claimed.
 */
export async function syncAccountCharacters(userId: number, characters: BnetCharacter[]) {
  const current = new Set(characters.map((c) => `${c.realmSlug}:${c.id}`));
  const stored = await all<{ realmSlug: string; characterId: number }>(
    "SELECT realm_slug AS realmSlug, character_id AS characterId FROM user_characters WHERE user_id = ?",
    [userId],
  );

  const writes: InStatement[] = stored
    .filter((c) => !current.has(characterKey(c)))
    .map((c) => ({
      sql: "DELETE FROM user_characters WHERE realm_slug = ? AND character_id = ?",
      args: [c.realmSlug, c.characterId],
    }));

  for (const c of characters) {
    writes.push({
      sql: `INSERT INTO user_characters (realm_slug, character_id, user_id, name, realm_name, class_id, level, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(realm_slug, character_id) DO UPDATE SET
              active = CASE WHEN user_characters.user_id = excluded.user_id THEN user_characters.active ELSE 0 END,
              user_id = excluded.user_id, name = excluded.name, realm_name = excluded.realm_name,
              class_id = excluded.class_id, level = excluded.level`,
      args: [c.realmSlug, c.id, userId, c.name, c.realmName, c.classId, c.level],
    });
  }

  await batch(writes);
}

export async function listAccountCharacters(userId: number): Promise<AccountCharacter[]> {
  const rows = await all<Omit<AccountCharacter, "active"> & { active: number }>(
    `SELECT realm_slug AS realmSlug, character_id AS characterId, name, realm_name AS realmName,
            class_id AS classId, level, active
     FROM user_characters WHERE user_id = ?`,
    [userId],
  );
  return rows.map((r) => ({ ...r, active: r.active === 1 }));
}

export async function hasActiveCharacter(userId: number): Promise<boolean> {
  return Boolean(await first("SELECT 1 AS yes FROM user_characters WHERE user_id = ? AND active = 1 LIMIT 1", [userId]));
}

/** Marks exactly the given characters (by characterKey) active; only max-level ones on the account count. */
export async function saveActiveCharacters(userId: number, activeKeys: Set<string>, maxLevel: number) {
  const characters = await listAccountCharacters(userId);
  await batch(
    characters.map((c) => ({
      sql: "UPDATE user_characters SET active = ? WHERE realm_slug = ? AND character_id = ? AND user_id = ?",
      args: [activeKeys.has(characterKey(c)) && c.level >= maxLevel ? 1 : 0, c.realmSlug, c.characterId, userId],
    })),
  );
}
