import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InArgs, type InStatement } from "@libsql/client";
import { config } from "./config";
import { seed } from "./seed";

/**
 * Each entry runs once, in order; schema_version records how many have run. Statements use IF NOT EXISTS
 * so two server instances starting at the same moment cannot trip over each other.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    bnet_id       TEXT NOT NULL UNIQUE,
    battletag     TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_login_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);

  -- realm_slug + bnet_character_id are filled the first time a Battle.net account
  -- claims the row by name; from then on only that exact character matches it.
  CREATE TABLE IF NOT EXISTS roster_characters (
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
  CREATE UNIQUE INDEX IF NOT EXISTS ux_roster_binding ON roster_characters(realm_slug, bnet_character_id)
    WHERE bnet_character_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS availability (
    roster_character_id INTEGER NOT NULL REFERENCES roster_characters(id) ON DELETE CASCADE,
    date                TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('yes', 'no', 'unset')),
    updated_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at          TEXT NOT NULL,
    PRIMARY KEY (roster_character_id, date)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

async function open(): Promise<Client> {
  const url = config.databaseUrl;
  const local = url.startsWith("file:");
  if (local) fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });

  const client = createClient({ url, authToken: config.databaseAuthToken || undefined });
  if (local) await client.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  await migrate(client);
  await seed(client);
  return client;
}

async function migrate(db: Client) {
  await db.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const { rows } = await db.execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version");
  for (let v = Number(rows[0].v); v < MIGRATIONS.length; v++) {
    await db.executeMultiple(MIGRATIONS[v]);
    await db.execute({ sql: "INSERT INTO schema_version (version) VALUES (?)", args: [v + 1] });
  }
}

// One client per server instance, kept across dev hot reloads; a failed start is retried on the next request.
const holder = globalThis as unknown as { __raidRosterDb?: Promise<Client> };

export function getDb(): Promise<Client> {
  holder.__raidRosterDb ??= open().catch((err) => {
    holder.__raidRosterDb = undefined;
    throw err;
  });
  return holder.__raidRosterDb;
}

/** Rows as plain objects keyed by column name. */
export async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const result = await (await getDb()).execute({ sql, args });
  return result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, row[i]])) as T);
}

export async function first<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(sql: string, args: InArgs = []): Promise<void> {
  await (await getDb()).execute({ sql, args });
}

/** Runs the statements in one transaction: all of them apply, or none do. */
export async function batch(statements: InStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await (await getDb()).batch(statements, "write");
}
