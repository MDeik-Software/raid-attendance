import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";
import { seed } from "./seed";

/** Each entry runs once, in order; PRAGMA user_version records how many have run. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    bnet_id       TEXT NOT NULL UNIQUE,
    battletag     TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_login_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX ix_sessions_user ON sessions(user_id);

  -- realm_slug + bnet_character_id are filled the first time a Battle.net account
  -- claims the row by name; from then on only that exact character matches it.
  CREATE TABLE roster_characters (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    class_id          INTEGER NOT NULL,
    group_no          INTEGER NOT NULL DEFAULT 1,
    sort_order        INTEGER NOT NULL,
    realm_slug        TEXT,
    bnet_character_id INTEGER,
    owner_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at        TEXT NOT NULL
  );
  CREATE UNIQUE INDEX ux_roster_binding ON roster_characters(realm_slug, bnet_character_id)
    WHERE bnet_character_id IS NOT NULL;

  CREATE TABLE availability (
    roster_character_id INTEGER NOT NULL REFERENCES roster_characters(id) ON DELETE CASCADE,
    date                TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('yes', 'no', 'unset')),
    updated_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at          TEXT NOT NULL,
    PRIMARY KEY (roster_character_id, date)
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

function open(): DatabaseSync {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.dataDir, "raid-roster.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  seed(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// One connection per server process, kept across dev hot reloads.
const holder = globalThis as unknown as { __raidRosterDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  holder.__raidRosterDb ??= open();
  return holder.__raidRosterDb;
}
