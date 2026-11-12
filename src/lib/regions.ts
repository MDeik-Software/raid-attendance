/** Battle.net regions with a WoW Profile API (China is separate and not supported). */
export const REGIONS = ["eu", "us", "kr", "tw"] as const;

export type Region = (typeof REGIONS)[number];

export const REGION_NAMES: Record<Region, string> = {
  eu: "Europe",
  us: "Americas & Oceania",
  kr: "Korea",
  tw: "Taiwan",
};

export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && (REGIONS as readonly string[]).includes(value);
}

/** Realm slugs as readable names ("tarren-mill" → "Tarren Mill") where the real name is not at hand. */
export function realmLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
