import "server-only";

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  /** Public base URL of the app; the Battle.net redirect URI is built from it. */
  appUrl: (process.env.APP_URL ?? "http://localhost:3020").replace(/\/+$/, ""),
  bnetClientId: process.env.BNET_CLIENT_ID ?? "",
  bnetClientSecret: process.env.BNET_CLIENT_SECRET ?? "",
  bnetRegion: (process.env.BNET_REGION ?? "eu").toLowerCase(),
  /** BattleTags (case-insensitive) that can edit every row, the roster and the settings. */
  adminBattletags: list(process.env.ADMIN_BATTLETAGS).map((t) => t.toLowerCase()),
  /** Decides what "today" is, so past dates lock at local midnight. */
  timeZone: process.env.APP_TIMEZONE ?? "Europe/Athens",
  dataDir: process.env.DATA_DIR ?? "./data",
  /** Local-only sign-in without Battle.net, for testing. Never active in production builds. */
  devLogin: process.env.DEV_LOGIN === "1" && process.env.NODE_ENV !== "production",
};

export function bnetConfigured(): boolean {
  return Boolean(config.bnetClientId && config.bnetClientSecret);
}

export function secureCookies(): boolean {
  return config.appUrl.startsWith("https://");
}
