import "server-only";
import type { Client, InStatement } from "@libsql/client";

/**
 * Raid nights Wed, Thu, Sun, Mon, Tue; Thursdays and Mondays default to "yes". Max level 90 (Midnight).
 * The roster itself comes from the guild import on the Roster & settings page.
 */
const SETTINGS: Record<string, string> = {
  start_date: "2026-11-12",
  end_date: "2027-01-12",
  raid_days: JSON.stringify([3, 4, 0, 1, 2]),
  default_yes_days: JSON.stringify([4, 1]),
  max_level: "90",
};

/** Fills an empty database once; never touches one that already has settings. */
export async function seed(db: Client) {
  const { rows } = await db.execute("SELECT COUNT(*) AS n FROM settings");
  if (Number(rows[0].n) > 0) return;

  const statements: InStatement[] = [
    // Inserted first: if another instance seeds at the same moment, this key collides and the whole batch rolls back.
    { sql: "INSERT INTO settings (key, value) VALUES ('seeded_at', ?)", args: [new Date().toISOString()] },
    ...Object.entries(SETTINGS).map(([key, value]) => ({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?)",
      args: [key, value],
    })),
  ];

  try {
    await db.batch(statements, "write");
  } catch (err) {
    if (!String((err as { code?: unknown })?.code ?? "").startsWith("SQLITE_CONSTRAINT")) throw err;
  }
}
