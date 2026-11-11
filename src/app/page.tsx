import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AvailabilityGrid, type GridColumn, type GridRow } from "@/components/AvailabilityGrid";
import { config } from "@/lib/config";
import { RESET_WEEKDAY, WEEKDAYS, raidDates, shortLabel, todayIn, weekday } from "@/lib/dates";
import { defaultStatus, getSettings, listAvailability, listRoster } from "@/lib/repo";
import { getCurrentUser } from "@/lib/session";
import type { Status } from "@/lib/status";

export default async function GridPage({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const roster = listRoster();
  const mine = roster.filter((c) => c.ownerUserId === user.id);

  if (!user.isAdmin && mine.length === 0) {
    return (
      <>
        <AppHeader user={user} active="grid" />
        <main className="mx-auto max-w-lg p-6 text-sm text-muted">
          <h1 className="mb-2 text-lg font-semibold text-foreground">None of your characters are on the roster</h1>
          <p>
            Your Battle.net account ({user.battletag}) has no character whose name matches the roster. If you
            should be on it, ask an officer to add your character, then sign out and sign in again.
          </p>
        </main>
      </>
    );
  }

  const { past } = await searchParams;
  const showPast = past === "1";
  const settings = getSettings();
  const today = todayIn(config.timeZone);
  const allDates = raidDates(settings.startDate, settings.endDate, settings.raidDays);
  const dates = showPast ? allDates : allDates.filter((d) => d >= today);
  const hasPast = allDates.some((d) => d < today);

  const answered = new Map<string, Status>();
  if (dates.length > 0) {
    for (const a of listAvailability(dates[0], dates[dates.length - 1])) {
      answered.set(`${a.characterId}|${a.date}`, a.status);
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

  const rows: GridRow[] = roster.map((c) => ({
    id: c.id,
    name: c.name,
    classId: c.classId,
    groupNo: c.groupNo,
    mine: c.ownerUserId === user.id,
    editable: user.isAdmin || c.ownerUserId === user.id,
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span>
            {user.isAdmin
              ? "You can change every row."
              : `Click your ${mine.length === 1 ? "row" : "rows"} to switch between yes, no and -.`}
          </span>
          <Legend />
          {hasPast && (
            <Link href={showPast ? "/" : "/?past=1"} className="ml-auto text-accent hover:underline">
              {showPast ? "Hide past nights" : "Show past nights"}
            </Link>
          )}
        </div>

        {columns.length === 0 ? (
          <p className="text-sm text-muted">No raid nights left in the schedule.</p>
        ) : (
          <AvailabilityGrid
            columns={columns}
            rows={rows}
            initialCells={cells}
            canEditPast={user.isAdmin}
          />
        )}
      </main>
    </>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-2">
      <span className="cell-yes rounded px-2 py-0.5 text-xs">yes</span>
      <span className="cell-no rounded px-2 py-0.5 text-xs">no</span>
      <span className="cell-unset rounded px-2 py-0.5 text-xs">-</span>
      <span className="text-xs">not set yet</span>
    </span>
  );
}
