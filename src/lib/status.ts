export type Status = "yes" | "no" | "unset";

export const STATUSES: readonly Status[] = ["yes", "no", "unset"];

/** Clicking a cell walks yes → no → - → yes. */
export const NEXT_STATUS: Record<Status, Status> = { yes: "no", no: "unset", unset: "yes" };

export const STATUS_LABEL: Record<Status, string> = { yes: "yes", no: "no", unset: "-" };

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}
