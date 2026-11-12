import "server-only";
import { fetchGuildRoster } from "./bnet";
import { bnetConfigured } from "./config";
import { getSettings, importGuild } from "./repo";

/** At sign-in: a recruit who was just promoted should not wait long for the next fetch. */
export const SIGN_IN_MAX_AGE_MS = 15 * 60_000;
/** While people use the grid: often enough that players who left the guild lose access the same day. */
export const BROWSING_MAX_AGE_MS = 6 * 3_600_000;

let running: Promise<void> | null = null;

/**
 * Fetches the imported guild's roster again when the stored copy is older than maxAgeMs, so new members,
 * level-ups, rank changes and leavers reach the raid team without an officer clicking Fetch. A failed or
 * empty answer is logged and leaves the stored roster as it is, so a Battle.net hiccup cannot empty the team.
 */
export function refreshGuildIfStale(maxAgeMs: number): Promise<void> {
  running ??= refresh(maxAgeMs).finally(() => {
    running = null;
  });
  return running;
}

async function refresh(maxAgeMs: number) {
  try {
    if (!bnetConfigured()) return;
    const { guild } = await getSettings();
    if (!guild) return;
    if (Date.now() - Date.parse(guild.fetchedAt) < maxAgeMs) return;

    const roster = await fetchGuildRoster(guild.region, guild.realmSlug, guild.name);
    if (!roster || roster.members.length === 0) {
      console.warn(`Guild roster refresh: Battle.net returned no members for ${guild.name}; keeping the stored roster`);
      return;
    }
    await importGuild(
      { region: guild.region, realmSlug: guild.realmSlug, realmName: guild.realmName, name: roster.name },
      roster.members,
    );
  } catch (err) {
    console.error("Guild roster refresh failed; keeping the stored roster", err);
  }
}
