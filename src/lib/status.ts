export type Status = "yes" | "no" | "unset";

/** In the order the grid's dropdown offers them. */
export const STATUSES: readonly Status[] = ["yes", "no", "unset"];

export const STATUS_LABEL: Record<Status, string> = { yes: "yes", no: "no", unset: "-" };

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}
