"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLASSES } from "@/lib/classes";
import { config } from "@/lib/config";
import { isIsoDate, rangeIsValid, todayIn, weekday } from "@/lib/dates";
import * as repo from "@/lib/repo";
import { getCurrentUser } from "@/lib/session";
import { isStatus, type Status } from "@/lib/status";

type Result = { ok: true } | { ok: false; error: string };

/** Sets one cell. Players may change their own characters from today on; admins may change anything. */
export async function setAvailabilityAction(characterId: number, date: string, status: Status): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has ended. Sign in again." };
  if (!Number.isInteger(characterId) || !isIsoDate(date) || !isStatus(status)) {
    return { ok: false, error: "That change was not valid." };
  }

  const settings = repo.getSettings();
  const isRaidDate =
    date >= settings.startDate && date <= settings.endDate && settings.raidDays.includes(weekday(date));
  if (!isRaidDate) return { ok: false, error: "That date is not a raid night." };

  const character = repo.getRosterCharacter(characterId);
  if (!character) return { ok: false, error: "That character is no longer on the roster." };

  if (!user.isAdmin) {
    if (character.ownerUserId !== user.id) return { ok: false, error: "You can only change your own characters." };
    if (date < todayIn(config.timeZone)) return { ok: false, error: "Past raid nights are locked." };
  }

  repo.setAvailability(characterId, date, status, user.id);
  return { ok: true };
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
  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/admin?ok=${encodeURIComponent(message)}`);
}

function readCharacterFields(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const classId = Number(form.get("classId"));
  const groupNo = Number(form.get("groupNo"));
  if (!name || name.length > 24) fail("Enter a character name of up to 24 characters.");
  if (!CLASSES.some((c) => c.id === classId)) fail("Pick a class.");
  if (!Number.isInteger(groupNo) || groupNo < 1 || groupNo > 9) fail("Block must be a number from 1 to 9.");
  return { name, classId, groupNo };
}

function readId(form: FormData): number {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || !repo.getRosterCharacter(id)) fail("That character is no longer on the roster.");
  return id;
}

export async function addCharacterAction(form: FormData) {
  await requireAdmin();
  const { name, classId, groupNo } = readCharacterFields(form);
  if (repo.nameTaken(name)) fail(`${name} is already on the roster.`);
  repo.addCharacter(name, classId, groupNo);
  done(`Added ${name}.`);
}

export async function updateCharacterAction(form: FormData) {
  await requireAdmin();
  const id = readId(form);
  const { name, classId, groupNo } = readCharacterFields(form);
  if (repo.nameTaken(name, id)) fail(`${name} is already on the roster.`);
  repo.updateCharacter(id, name, classId, groupNo);
  done(`Saved ${name}.`);
}

export async function moveCharacterAction(form: FormData) {
  await requireAdmin();
  const id = readId(form);
  repo.moveCharacter(id, form.get("direction") === "up" ? "up" : "down");
  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

export async function resetClaimAction(form: FormData) {
  await requireAdmin();
  const id = readId(form);
  const name = repo.getRosterCharacter(id)?.name;
  repo.resetClaim(id);
  done(`${name} is unclaimed; the next player who signs in with that character name claims it.`);
}

export async function removeCharacterAction(form: FormData) {
  await requireAdmin();
  const id = readId(form);
  const name = repo.getRosterCharacter(id)?.name;
  repo.removeCharacter(id);
  done(`Removed ${name} and their answers.`);
}

export async function saveSettingsAction(form: FormData) {
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

  repo.saveSettings({ startDate, endDate, raidDays, defaultYesDays });
  done("Settings saved.");
}
