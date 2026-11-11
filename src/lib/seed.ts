import "server-only";
import type { Client, InStatement } from "@libsql/client";

/** Roster as it was in the guild's roster addon on 2026-11-11: four blocks, top to bottom. */
const ROSTER: { name: string; classId: number; group: number }[] = [
  { name: "Avacin", classId: 6, group: 1 },
  { name: "Meraleph", classId: 2, group: 1 },

  { name: "Dhockney", classId: 10, group: 2 },
  { name: "Lustforblood", classId: 7, group: 2 },
  { name: "Mpelantona", classId: 5, group: 2 },
  { name: "Varanthian", classId: 13, group: 2 },

  { name: "Apollonus", classId: 2, group: 3 },
  { name: "Aszuma", classId: 11, group: 3 },
  { name: "Sarabande", classId: 9, group: 3 },
  { name: "Coldviper", classId: 4, group: 3 },
  { name: "Draizer", classId: 1, group: 3 },
  { name: "Manouvras", classId: 6, group: 3 },
  { name: "Squadra", classId: 10, group: 3 },

  { name: "Blazenar", classId: 8, group: 4 },
  { name: "Haterade", classId: 11, group: 4 },
  { name: "Hormouz", classId: 8, group: 4 },
  { name: "Howimetmypet", classId: 3, group: 4 },
  { name: "Iobolos", classId: 11, group: 4 },
  { name: "Jiklaspower", classId: 3, group: 4 },
  { name: "Kaserisdh", classId: 12, group: 4 },
  { name: "Stassy", classId: 5, group: 4 },
  { name: "Okàmi", classId: 9, group: 4 },
  { name: "Tokalopaidi", classId: 13, group: 4 },
];

/** Raid nights Wed, Thu, Sun, Mon, Tue; Thursdays and Mondays default to "yes". */
const SETTINGS: Record<string, string> = {
  start_date: "2026-11-12",
  end_date: "2027-01-12",
  raid_days: JSON.stringify([3, 4, 0, 1, 2]),
  default_yes_days: JSON.stringify([4, 1]),
};

/** Fills an empty database once; never touches one that already has settings. */
export async function seed(db: Client) {
  const { rows } = await db.execute("SELECT COUNT(*) AS n FROM settings");
  if (Number(rows[0].n) > 0) return;

  const now = new Date().toISOString();
  const statements: InStatement[] = [
    // Inserted first: if another instance seeds at the same moment, this key collides and the whole batch rolls back.
    { sql: "INSERT INTO settings (key, value) VALUES ('seeded_at', ?)", args: [now] },
    ...Object.entries(SETTINGS).map(([key, value]) => ({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?)",
      args: [key, value],
    })),
    ...ROSTER.map((c, i) => ({
      sql: "INSERT INTO roster_characters (name, class_id, group_no, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [c.name, c.classId, c.group, i + 1, now],
    })),
  ];

  try {
    await db.batch(statements, "write");
  } catch (err) {
    if (!String((err as { code?: unknown })?.code ?? "").startsWith("SQLITE_CONSTRAINT")) throw err;
  }
}
