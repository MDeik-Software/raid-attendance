import Link from "next/link";
import { after } from "next/server";
import { AppHeader } from "@/components/AppHeader";
import { CharacterSheet, ago } from "@/components/CharacterSheet";
import { CharacterPicker } from "@/components/HomeControls";
import { requireRosterAccess } from "@/lib/access";
import { classById } from "@/lib/classes";
import { config } from "@/lib/config";
import { WEEKDAYS, raidDates, shortLabel, todayIn, weekday } from "@/lib/dates";
import { BROWSING_MAX_AGE_MS, refreshGuildIfStale } from "@/lib/guild-refresh";
import {
  TEAM_PROFILE_MAX_AGE_MS,
  cachedProfiles,
  loadProfile,
  refreshTeamProfiles,
  type CharacterProfile,
} from "@/lib/profile";
import { enchantSlots, readiness, type NextNight } from "@/lib/readiness";
import { defaultStatus, getSettings, listAvailability, listTeam, type Member, type Settings } from "@/lib/repo";

/** Team average item level needs a few sheets before it means anything. */
const MIN_PROFILES_FOR_AVERAGE = 3;

async function nextNight(member: Member, settings: Settings): Promise<NextNight | null> {
  const today = todayIn(config.timeZone);
  const date = raidDates(settings.startDate, settings.endDate, settings.raidDays).find((d) => d >= today);
  if (!date) return null;
  const answer = (await listAvailability(date, date)).find((a) => a.memberId === member.id);
  return { day: WEEKDAYS[weekday(date)], label: shortLabel(date), status: answer?.status ?? defaultStatus(date, settings) };
}

const PROBLEMS = {
  "not-configured": "Battle.net is not set up on this server, so character sheets cannot be loaded.",
  "not-found":
    "Battle.net does not know this character right now. That happens after a rename or realm transfer, or if the character has not logged in for a long time.",
  unavailable: "Battle.net did not answer. Try again in a minute.",
} as const;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireRosterAccess();
  const settings = await getSettings();
  const team = await listTeam(settings);
  const region = settings.guild?.region ?? "eu";
  after(() => refreshGuildIfStale(BROWSING_MAX_AGE_MS));

  const mine = team.filter((m) => m.ownerUserId === user.id);
  const options = user.isAdmin ? team : mine;

  if (options.length === 0) {
    return (
      <>
        <AppHeader user={user} active="home" />
        <main className="mx-auto max-w-lg p-6 text-sm text-muted">
          {team.length === 0 ? (
            <>
              <h1 className="mb-2 text-lg font-semibold text-foreground">The raid team is not set up yet</h1>
              <p>Check back once an officer has picked the raid team.</p>
            </>
          ) : (
            <>
              <h1 className="mb-2 text-lg font-semibold text-foreground">Pick your raid character</h1>
              <p>
                Tick the characters you raid on under{" "}
                <Link href="/characters" className="text-accent hover:underline">
                  My characters
                </Link>{" "}
                to see their gear, talents and raid readiness here.
              </p>
            </>
          )}
        </main>
      </>
    );
  }

  const wanted = Number((await searchParams).c);
  const member = options.find((m) => m.id === wanted) ?? mine[0] ?? options[0];

  const [loaded, cached, night] = await Promise.all([
    loadProfile(member, region),
    cachedProfiles(team),
    nextNight(member, settings),
  ]);
  after(() => refreshTeamProfiles(team, region, TEAM_PROFILE_MAX_AGE_MS, 8));

  const teamProfiles = [...cached.values()].map((c) => c.profile).filter((p): p is CharacterProfile => p != null);
  const teamAverage =
    teamProfiles.length >= MIN_PROFILES_FOR_AVERAGE
      ? teamProfiles.reduce((sum, p) => sum + p.equippedItemLevel, 0) / teamProfiles.length
      : null;

  return (
    <>
      <AppHeader user={user} active="home" />
      <main className="mx-auto w-full max-w-5xl space-y-4 p-4">
        {(mine.length > 1 || user.isAdmin) && (
          <div className="flex flex-wrap items-center gap-2">
            {mine.map((m) => (
              <Link
                key={m.id}
                href={`/?c=${m.id}`}
                className={`rounded px-3 py-1 text-sm ${
                  m.id === member.id ? "bg-surface-2 text-foreground" : "border border-border text-muted hover:text-foreground"
                }`}
                style={{ boxShadow: `inset 3px 0 0 ${classById(m.classId).color}` }}
              >
                {m.name}
              </Link>
            ))}
            {user.isAdmin && (
              <div className="ml-auto">
                <CharacterPicker options={team.map((m) => ({ id: m.id, name: m.name }))} selected={member.id} />
              </div>
            )}
          </div>
        )}

        {loaded.profile ? (
          <CharacterSheet
            profile={loaded.profile}
            region={region}
            realmSlug={member.realmSlug}
            readiness={readiness(loaded.profile, { enchantSlots: enchantSlots(teamProfiles), teamAverage, nextNight: night })}
            teamAverage={teamAverage}
            updated={
              loaded.problem && loaded.fetchedAt
                ? `could not refresh from Battle.net, showing data from ${ago(loaded.fetchedAt)}`
                : `updated ${ago(loaded.fetchedAt ?? new Date().toISOString())}`
            }
          />
        ) : (
          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <h1 className="text-lg font-semibold" style={{ color: classById(member.classId).color }}>
              {member.name}
            </h1>
            <p className="mt-2 text-muted">{PROBLEMS[loaded.problem ?? "unavailable"]}</p>
          </section>
        )}
      </main>
    </>
  );
}
