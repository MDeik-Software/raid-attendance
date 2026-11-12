"use client";

import Link from "next/link";
import { useState } from "react";
import { setAvailabilityAction } from "@/app/actions";
import { classById } from "@/lib/classes";
import { STATUSES, STATUS_LABEL, type Status } from "@/lib/status";

export type GridColumn = {
  date: string;
  day: string;
  label: string;
  /** First night of a raid week (Wednesday reset). */
  weekStart: boolean;
  past: boolean;
  today: boolean;
};

export type GridRow = {
  id: number;
  name: string;
  classId: number;
  groupNo: number;
  mine: boolean;
  /** Some player has ticked this character as theirs. */
  claimed: boolean;
  editable: boolean;
  /** The name links to the character's sheet on the home page (own characters, or any for officers). */
  viewable: boolean;
};

/** The "!" next to a raid team character that no player has claimed yet. */
export function UnclaimedMark() {
  return (
    <span
      role="img"
      aria-label="Not claimed"
      title="Not claimed: no player has ticked this character under My characters yet"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold leading-none text-black"
    >
      !
    </span>
  );
}

const WEEK_LINE = "border-l-2 border-l-[#6b6b80]";
const BLOCK_LINE = "border-t-2 border-t-[#55556a]";

export function AvailabilityGrid({
  columns,
  rows,
  initialCells,
  canEditPast,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  initialCells: Record<string, Status>;
  canEditPast: boolean;
}) {
  const [cells, setCells] = useState(initialCells);
  const [error, setError] = useState<string | null>(null);

  function change(row: GridRow, column: GridColumn, next: Status) {
    const key = `${row.id}|${column.date}`;
    const previous = cells[key];
    if (next === previous) return;
    setCells((c) => ({ ...c, [key]: next }));
    setError(null);

    const revert = (message: string) => {
      setCells((c) => ({ ...c, [key]: previous }));
      setError(message);
    };
    setAvailabilityAction(row.id, column.date, next)
      .then((res) => {
        if (!res.ok) revert(res.error);
      })
      .catch(() => revert("Could not save that change. Check your connection and try again."));
  }

  const yesCount = (date: string) => rows.filter((r) => cells[`${r.id}|${date}`] === "yes").length;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-44 border-b-2 border-b-[#55556a] bg-surface px-3 py-2 text-left font-semibold">
                Player
              </th>
              {columns.map((c) => (
                <th
                  key={c.date}
                  scope="col"
                  className={`sticky top-0 z-20 border-b-2 border-b-[#55556a] bg-surface px-1 py-1.5 text-center font-medium ${
                    c.weekStart ? WEEK_LINE : ""
                  } ${c.today ? "text-accent" : c.past ? "text-muted/60" : ""}`}
                >
                  <div className="text-xs">{c.day}</div>
                  <div className="text-[11px] font-normal text-muted">{c.label}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => {
              const cls = classById(row.classId);
              const newBlock = i > 0 && rows[i - 1].groupNo !== row.groupNo;
              return (
                <tr key={row.id}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1 text-left font-semibold ${
                      newBlock ? BLOCK_LINE : ""
                    }`}
                    style={{
                      backgroundImage: `linear-gradient(90deg, ${cls.color}66, ${cls.color}1a 75%, transparent)`,
                      boxShadow: `inset 3px 0 0 ${cls.color}`,
                    }}
                    title={cls.name}
                  >
                    {row.viewable ? (
                      <Link href={`/?c=${row.id}`} className="hover:underline" title={`${row.name}'s character sheet`}>
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    {!row.claimed && (
                      <span className="ml-1.5 inline-block align-[-2px]">
                        <UnclaimedMark />
                      </span>
                    )}
                    {row.mine && (
                      <span className="ml-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white/80">
                        you
                      </span>
                    )}
                  </th>
                  {columns.map((c) => {
                    const status = cells[`${row.id}|${c.date}`];
                    const editable = row.editable && (!c.past || canEditPast);
                    const label = STATUS_LABEL[status];
                    const cellClass = `cell-${status} flex h-9 w-full min-w-16 items-center justify-center rounded text-sm font-medium`;
                    return (
                      <td
                        key={c.date}
                        className={`p-1 ${c.weekStart ? WEEK_LINE : ""} ${newBlock ? BLOCK_LINE : ""} ${
                          c.past ? "opacity-50" : ""
                        }`}
                      >
                        {editable ? (
                          <div className="relative">
                            <select
                              value={status}
                              onChange={(e) => change(row, c, e.target.value as Status)}
                              aria-label={`${row.name}, ${c.day} ${c.label}`}
                              className={`${cellClass} cell-select cursor-pointer appearance-none border-0 pr-3 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-accent`}
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s} className="bg-surface text-foreground">
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] opacity-70"
                            >
                              ▼
                            </span>
                          </div>
                        ) : (
                          <div className={`${cellClass} opacity-80`} aria-label={`${row.name}, ${c.day} ${c.label}: ${label}`}>
                            {label}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <th className="sticky bottom-0 left-0 z-30 border-t-2 border-t-[#55556a] bg-surface px-3 py-2 text-left text-xs font-semibold text-muted">
                Yes count
              </th>
              {columns.map((c) => (
                <td
                  key={c.date}
                  className={`sticky bottom-0 z-20 border-t-2 border-t-[#55556a] bg-surface py-2 text-center text-xs font-semibold ${
                    c.weekStart ? WEEK_LINE : ""
                  }`}
                >
                  {yesCount(c.date)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {error && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-100 shadow-lg"
        >
          {error}
          <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white">
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
