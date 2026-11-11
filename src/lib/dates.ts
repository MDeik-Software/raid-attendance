/** Calendar dates are plain "YYYY-MM-DD" strings; weekdays use JS numbering (0 = Sunday). */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Monday-first order for settings forms. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** EU weekly reset; a thicker line marks the start of each raid week. */
export const RESET_WEEKDAY = 3;

const MAX_RANGE_DAYS = 3 * 366;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = toUtc(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function weekday(date: string): number {
  return toUtc(date).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Every date from start to end (inclusive) that falls on one of the raid weekdays. */
export function raidDates(start: string, end: string, raidDays: number[]): string[] {
  const out: string[] = [];
  if (daysBetween(start, end) > MAX_RANGE_DAYS) return out;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (raidDays.includes(weekday(d))) out.push(d);
  }
  return out;
}

export function rangeIsValid(start: string, end: string): boolean {
  return start <= end && daysBetween(start, end) <= MAX_RANGE_DAYS;
}

/** "dd/mm" */
export function shortLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
