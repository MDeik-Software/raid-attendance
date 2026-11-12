/** Equipment slots as the Blizzard API names them, with the labels the app shows. */
export const SLOT_LABELS: Record<string, string> = {
  HEAD: "Head",
  NECK: "Neck",
  SHOULDER: "Shoulders",
  BACK: "Back",
  CHEST: "Chest",
  WRIST: "Wrists",
  MAIN_HAND: "Main hand",
  OFF_HAND: "Off hand",
  HANDS: "Hands",
  WAIST: "Waist",
  LEGS: "Legs",
  FEET: "Feet",
  FINGER_1: "Ring 1",
  FINGER_2: "Ring 2",
  TRINKET_1: "Trinket 1",
  TRINKET_2: "Trinket 2",
};

const PLURAL = new Set(["SHOULDER", "WRIST", "HANDS", "LEGS", "FEET"]);

export function slotLabel(slot: string, fallback = slot): string {
  return SLOT_LABELS[slot] ?? fallback;
}

/** "Legs have", "Ring 1 has". */
export function slotHas(slot: string, fallback?: string): string {
  return `${slotLabel(slot, fallback)} ${PLURAL.has(slot) ? "have" : "has"}`;
}

/** "Feet are", "Neck is". */
export function slotIs(slot: string, fallback?: string): string {
  return `${slotLabel(slot, fallback)} ${PLURAL.has(slot) ? "are" : "is"}`;
}
