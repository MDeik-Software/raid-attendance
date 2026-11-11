export type WowClass = { id: number; name: string; color: string };

/** Playable class ids as used by the Blizzard API, with the in-game class colours. */
export const CLASSES: WowClass[] = [
  { id: 1, name: "Warrior", color: "#C69B6D" },
  { id: 2, name: "Paladin", color: "#F48CBA" },
  { id: 3, name: "Hunter", color: "#AAD372" },
  { id: 4, name: "Rogue", color: "#FFF468" },
  { id: 5, name: "Priest", color: "#FFFFFF" },
  { id: 6, name: "Death Knight", color: "#C41E3A" },
  { id: 7, name: "Shaman", color: "#0070DD" },
  { id: 8, name: "Mage", color: "#3FC7EB" },
  { id: 9, name: "Warlock", color: "#8788EE" },
  { id: 10, name: "Monk", color: "#00FF98" },
  { id: 11, name: "Druid", color: "#FF7C0A" },
  { id: 12, name: "Demon Hunter", color: "#A330C9" },
  { id: 13, name: "Evoker", color: "#33937F" },
];

export function classById(id: number): WowClass {
  return CLASSES.find((c) => c.id === id) ?? { id, name: "Unknown", color: "#9CA3AF" };
}
