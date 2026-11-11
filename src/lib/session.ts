import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { config, secureCookies } from "./config";
import { getDb } from "./db";

export const SESSION_COOKIE = "rr_session";
const SESSION_DAYS = 30;

export type CurrentUser = { id: number; battletag: string; isAdmin: boolean };

function hash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Stores only the token's hash; the raw token lives in the browser cookie. */
export function createSession(userId: number): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hash(token),
    userId,
    expires.toISOString(),
  );
  return { token, expires };
}

export function sessionCookie(token: string, expires: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookies(),
    path: "/",
    expires,
  };
}

export function isAdminBattletag(battletag: string): boolean {
  return config.adminBattletags.includes(battletag.toLowerCase());
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.battletag, s.expires_at AS expiresAt
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hash(token)) as { id: number; battletag: string; expiresAt: string } | undefined;
  if (!row || row.expiresAt < new Date().toISOString()) return null;
  return { id: row.id, battletag: row.battletag, isAdmin: isAdminBattletag(row.battletag) };
});

export function destroySession(token: string | undefined) {
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
}
