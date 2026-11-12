"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchGuildRoster, fetchRealms, type Realm } from "@/lib/bnet";
import { saveActiveCharacters } from "@/lib/claims";
import { config } from "@/lib/config";
import { isIsoDate, rangeIsValid, todayIn, weekday } from "@/lib/dates";
import { isRegion, realmLabel, REGION_NAMES } from "@/lib/regions";
import * as repo from "@/lib/repo";
import { getCurrentUser } from "@/lib/session";
import { isStatus, type Status } from "@/lib/status";

type Result = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/characters");
  revalidatePath("/admin");
}

/** Sets one cell. Players may change the team characters they claimed, from today on; admins anything. */
export async function setAvailabilityAction(memberId: number, date: string, status: Status): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has ended. Sign in again." };
  if (!Number.isInteger(memberId) || !isIsoDate(date) || !isStatus(status)) {
    return { ok: false, error: "That change was not valid." };
  }

  const [settings, member] = await Promise.all([repo.getSettings(), repo.getMember(memberId)]);
  const isRaidDate =
    date >= settings.startDate && date <= settings.endDate && settings.raidDays.includes(weekday(date));
  if (!isRaidDate) return { ok: false, error: "That date is not a raid night." };
  if (!member || !repo.isOnTeam(member, settings)) return { ok: false, error: "That character is not on the raid team." };

  if (!user.isAdmin) {
    if (member.ownerUserId !== user.id) return { ok: false, error: "You can only change characters you claimed." };
    if (date < todayIn(config.timeZone)) return { ok: false, error: "Past raid nights are locked." };
  }

  await repo.setAvailability(memberId, date, status, user.id);
  return { ok: true };
}

// ---------- players ----------

/** Saves which of the player's characters are active; active raid team characters become theirs to edit. */
export async function saveActiveCharactersAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await repo.getSettings();
  const keys = new Set(form.getAll("active").map(String));
  await saveActiveCharacters(user.id, keys, settings.maxLevel);
  revalidateAll();
  redirect("/");
}

// ---------- admin ----------

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");
  return user;
}

function fail(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidateAll();
  redirect(`/admin?ok=${encodeURIComponent(message)}`);
}

/** Realm list for the guild form when the officer switches region. */
export async function listRealmsAction(region: string): Promise<{ ok: true; realms: Realm[] } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, error: "Only officers can do that." };
  if (!isRegion(region)) return { ok: false, error: "Unknown region." };
  try {
    return { ok: true, realms: await fetchRealms(region) };
  } catch (err) {
    console.error("Realm list failed", err);
    return { ok: false, error: "Battle.net did not send the realm list. Try again in a minute." };
  }
}

export async function importGuildAction(form: FormData) {
  await requireAdmin();
  const region = String(form.get("region") ?? "");
  const realmSlug = String(form.get("realmSlug") ?? "");
  const guildName = String(form.get("guildName") ?? "").trim();
  if (!isRegion(region)) fail("Pick a region.");
  if (!/^[\p{L}\p{N}-]+$/u.test(realmSlug)) fail("Pick a realm.");
  if (!guildName || guildName.length > 24) fail("Enter the guild name (up to 24 characters).");

  const fetched = await Promise.all([
    fetchRealms(region).catch(() => [] as Realm[]),
    fetchGuildRoster(region, realmSlug, guildName),
  ]).catch((err) => {
    console.error("Guild roster request failed", err);
    return null;
  });
  if (!fetched) fail("Battle.net did not answer. Try again in a minute.");

  const [realms, roster] = fetched;
  const realmName = realms.find((r) => r.slug === realmSlug)?.name ?? realmLabel(realmSlug);
  if (!roster || roster.members.length === 0) {
    fail(`Battle.net knows no guild called "${guildName}" on ${realmName} (${REGION_NAMES[region]}). Check the name and the realm.`);
  }

  const refreshed = await repo.importGuild({ region, realmSlug, realmName, name: roster.name }, roster.members);
  done(
    refreshed
      ? `Fetched ${roster.members.length} members of ${roster.name} again; the team follows any rank and level changes.`
      : `Fetched ${roster.members.length} members of ${roster.name}. Now pick the ranks the raid team comes from.`,
  );
}

export async function saveRanksAction(form: FormData) {
  await requireAdmin();
  const maxLevel = Number(form.get("maxLevel"));
  if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 200) fail("Max level must be a whole number.");

  const ranks = new Set((await repo.listMembers()).map((m) => m.rank));
  const raidRanks = [...new Set(form.getAll("raidRanks").map(Number))].filter((r) => ranks.has(r)).sort((a, b) => a - b);
  const rankNames: Record<string, string> = {};
  for (const rank of ranks) {
    const name = String(form.get(`rankName_${rank}`) ?? "").trim().slice(0, 24);
    if (name) rankNames[rank] = name;
  }

  await repo.saveRanks(raidRanks, rankNames, maxLevel);
  done(raidRanks.length ? "Ranks saved. Check the raid team below." : "Ranks saved. Pick at least one rank to build the raid team.");
}

export async function saveTeamAction(form: FormData) {
  await requireAdmin();
  const [settings, members] = await Promise.all([repo.getSettings(), repo.listMembers()]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const onTeam = new Set(form.getAll("onTeam").map(Number));

  const changes: repo.TeamChange[] = [];
  for (const id of new Set(form.getAll("shown").map(Number))) {
    const member = byId.get(id);
    if (!member) continue;
    const groupNo = Number(form.get(`group_${id}`));
    if (!Number.isInteger(groupNo) || groupNo < 1 || groupNo > 9) fail(`Block for ${member.name} must be a number from 1 to 9.`);
    const wanted = onTeam.has(id);
    // Store only choices that differ from the rank rule, so rank changes keep working for everyone else.
    changes.push({ id, override: wanted === repo.teamByDefault(member, settings) ? null : wanted, groupNo });
  }

  await repo.saveTeam(changes);
  const team = await repo.listTeam(settings);
  done(`Raid team saved: ${team.length} characters.`);
}

export async function saveScheduleAction(form: FormData) {
  await requireAdmin();
  const startDate = String(form.get("startDate") ?? "");
  const endDate = String(form.get("endDate") ?? "");
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail("Enter both dates.");
  if (!rangeIsValid(startDate, endDate)) fail("The end date must be after the start date and at most 3 years later.");

  const days = (key: string) =>
    form
      .getAll(key)
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const raidDays = [...new Set(days("raidDays"))];
  if (raidDays.length === 0) fail("Pick at least one raid night.");
  const defaultYesDays = [...new Set(days("defaultYesDays"))].filter((d) => raidDays.includes(d));

  await repo.saveSchedule({ startDate, endDate, raidDays, defaultYesDays });
  done("Schedule saved.");
}
