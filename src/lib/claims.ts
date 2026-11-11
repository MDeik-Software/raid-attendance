import "server-only";
import type { BnetCharacter } from "./bnet";
import { getDb, transaction } from "./db";
import { normaliseName } from "./repo";

type Row = {
  id: number;
  name: string;
  realmSlug: string | null;
  bnetCharacterId: number | null;
  ownerUserId: number | null;
};

/**
 * Gives the user the roster rows that belong to characters on their Battle.net account.
 *
 * A row that was claimed before matches only the exact character (realm + Blizzard id) that claimed it,
 * so a same-named character on another realm cannot take it over. An unclaimed row matches by name and
 * is then bound to that character. Rows the user owned but whose character left the account are released.
 * Returns the ids of the rows the user now owns.
 */
export function syncCharacters(userId: number, characters: BnetCharacter[]): number[] {
  const db = getDb();
  return transaction(db, () => {
    const roster = db
      .prepare(
        `SELECT id, name, realm_slug AS realmSlug, bnet_character_id AS bnetCharacterId,
                owner_user_id AS ownerUserId
         FROM roster_characters`,
      )
      .all() as unknown as Row[];

    const byBinding = new Map<string, Row>();
    const unclaimedByName = new Map<string, Row>();
    for (const row of roster) {
      if (row.bnetCharacterId != null) byBinding.set(`${row.realmSlug}:${row.bnetCharacterId}`, row);
      else unclaimedByName.set(normaliseName(row.name), row);
    }

    const claim = db.prepare(
      `UPDATE roster_characters
       SET realm_slug = ?, bnet_character_id = ?, owner_user_id = ?, class_id = COALESCE(?, class_id)
       WHERE id = ?`,
    );
    const owned = new Set<number>();

    for (const c of characters) {
      const key = normaliseName(c.name);
      const row = byBinding.get(`${c.realmSlug}:${c.id}`) ?? unclaimedByName.get(key);
      if (!row || owned.has(row.id)) continue;
      owned.add(row.id);
      unclaimedByName.delete(key);
      claim.run(c.realmSlug, c.id, userId, c.classId, row.id);
    }

    const release = db.prepare("UPDATE roster_characters SET owner_user_id = NULL WHERE id = ?");
    for (const row of roster) {
      if (row.ownerUserId === userId && !owned.has(row.id)) release.run(row.id);
    }
    return [...owned];
  });
}
