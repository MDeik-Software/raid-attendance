import Link from "next/link";
import { after } from "next/server";
import { AppHeader } from "@/components/AppHeader";
import { AvailabilityGrid, UnclaimedMark, type GridColumn, type GridRow } from "@/components/AvailabilityGrid";
import { requireRosterAccess } from "@/lib/access";
import { config } from "@/lib/config";
import { RESET_WEEKDAY, WEEKDAYS, raidDates, shortLabel, todayIn, weekday } from "@/lib/dates";
import { BROWSING_MAX_AGE_MS, refreshGuildIfStale } from "@/lib/guild-refresh";
import { defaultStatus, getSettings, listAvailability, listTeam } from "@/lib/repo";
import type { Status } from "@/lib/status";

export default async function AvailabilityPage({ searchParams }: PageProps<"/availability">) {
  const user = await requireRosterAccess();
  // Keeps the team current (and drops players who left the guild) without slowing this page down.
  after(() => refreshGuildIfStale(BROWSING_MAX_AGE_MS));

  const settings = await getSettings();
  const team = await listTeam(settings);
  const mine = team.filter((m) => m.ownerUserId === user.id);

  if (team.length === 0) {
    return (
      <>
        <AppHeader user={user} active="grid" />
        <main className="mx-auto max-w-lg p-6 text-sm text-muted">
          <h1 className="mb-2 text-lg font-semibold text-foreground">The raid team is not set up yet</h1>
          {user.isAdmin ? (
            <p>
              Fetch the guild and pick the raid team on{" "}
              <Link href="/admin" className="text-accent hover:underline">
                Roster &amp; settings
              </Link>
              .
            </p>
          ) : (
            <p>Check back once an officer has picked the raid team.</p>
          )}
        </main>
      </>
    );
  }

  const { past } = await searchParams;
  const showPast = past === "1";
  const today = todayIn(config.timeZone);
  const allDates = raidDates(settings.startDate, settings.endDate, settings.raidDays);
  const dates = showPast ? allDates : allDates.filter((d) => d >= today);
  const hasPast = allDates.some((d) => d < today);

  const answered = new Map<string, Status>();
  if (dates.length > 0) {
    for (const a of await listAvailability(dates[0], dates[dates.length - 1])) {
      answered.set(`${a.memberId}|${a.date}`, a.status);
    }
  }

  const columns: GridColumn[] = dates.map((date, i) => ({
    date,
    day: WEEKDAYS[weekday(date)],
    label: shortLabel(date),
    weekStart: i > 0 && weekday(date) === RESET_WEEKDAY,
    past: date < today,
    today: date === today,
  }));

  const rows: GridRow[] = team.map((m) => ({
    id: m.id,
    name: m.name,
    classId: m.classId,
    groupNo: m.groupNo,
    mine: m.ownerUserId === user.id,
    claimed: m.ownerUserId != null,
    editable: user.isAdmin || m.ownerUserId === user.id,
    viewable: user.isAdmin || m.ownerUserId === user.id,
  }));

  const cells: Record<string, Status> = {};
  for (const row of rows) {
    for (const date of dates) {
      const key = `${row.id}|${date}`;
      cells[key] = answered.get(key) ?? defaultStatus(date, settings);
    }
  }

  return (
    <>
      <AppHeader user={user} active="grid" />
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        {!user.isAdmin && mine.length === 0 && (
          <p className="rounded border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-100">
            You have not claimed a raid team character yet, so you cannot mark nights. Tick the characters you raid on
            under{" "}
            <Link href="/characters" className="font-medium text-accent hover:underline">
              My characters
            </Link>
            ; if yours is not on the team, ask an officer.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          {(user.isAdmin || mine.length > 0) && (
            <span>
              {user.isAdmin
                ? "You can change every row."
                : `Click your ${mine.length === 1 ? "row" : "rows"} to switch between yes, no and -.`}
            </span>
          )}
          <Legend />
          {hasPast && (
            <Link href={showPast ? "/availability" : "/availability?past=1"} className="ml-auto text-accent hover:underline">
              {showPast ? "Hide past nights" : "Show past nights"}
            </Link>
          )}
        </div>

        {columns.length === 0 ? (
          <p className="text-sm text-muted">No raid nights left in the schedule.</p>
        ) : (
          <AvailabilityGrid columns={columns} rows={rows} initialCells={cells} canEditPast={user.isAdmin} />
        )}
      </main>
    </>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="cell-yes rounded px-2 py-0.5 text-xs">yes</span>
      <span className="cell-no rounded px-2 py-0.5 text-xs">no</span>
      <span className="cell-unset rounded px-2 py-0.5 text-xs">-</span>
      <span className="text-xs">not set yet</span>
      <UnclaimedMark />
      <span className="text-xs">no player has claimed the character</span>
    </span>
  );
}
