import type { CharacterProfile, ProfileItem } from "./profile";
import { slotHas, slotIs } from "./slots";
import type { Status } from "./status";

/** A slot this many item levels below the character's equipped average is worth replacing first. */
export const LOW_SLOT_GAP = 10;
/** The enchant check needs this many team sheets before it trusts what "most of the team" does. */
const MIN_PROFILES_FOR_ENCHANTS = 4;

export type Check = { kind: "fix" | "ok" | "info"; text: string; slot?: string };

export type NextNight = { day: string; label: string; status: Status };

export type Readiness = { checks: Check[]; slotProblems: Map<string, string[]> };

/** Shirt and tabard have no stats, so they never count. */
const IGNORED_SLOTS = new Set(["SHIRT", "TABARD"]);

function canHoldEnchant(item: ProfileItem): boolean {
  // Off-hand frills and shields cannot be enchanted; off-hand weapons can.
  return item.slot !== "OFF_HAND" || item.itemClassId === 2;
}

/**
 * Which slots take an enchant this season, judged from the raid team's own gear: a slot counts when most team
 * members with an enchantable item there have enchanted it. This follows the game from patch to patch without a
 * hand-kept list. Null until enough of the team has been loaded.
 */
export function enchantSlots(teamProfiles: CharacterProfile[]): Set<string> | null {
  if (teamProfiles.length < MIN_PROFILES_FOR_ENCHANTS) return null;
  const seen = new Map<string, { items: number; enchanted: number }>();
  for (const profile of teamProfiles) {
    for (const item of profile.items) {
      if (IGNORED_SLOTS.has(item.slot) || !canHoldEnchant(item)) continue;
      const s = seen.get(item.slot) ?? { items: 0, enchanted: 0 };
      s.items++;
      if (item.enchants.length > 0) s.enchanted++;
      seen.set(item.slot, s);
    }
  }
  return new Set([...seen].filter(([, s]) => s.items >= MIN_PROFILES_FOR_ENCHANTS / 2 && s.enchanted * 2 > s.items).map(([slot]) => slot));
}

export function readiness(
  profile: CharacterProfile,
  context: { enchantSlots: Set<string> | null; teamAverage: number | null; nextNight: NextNight | null },
): Readiness {
  const checks: Check[] = [];
  const slotProblems = new Map<string, string[]>();
  const flag = (item: ProfileItem, text: string) => {
    slotProblems.set(item.slot, [...(slotProblems.get(item.slot) ?? []), text]);
    checks.push({ kind: "fix", text, slot: item.slot });
  };
  const items = profile.items.filter((i) => !IGNORED_SLOTS.has(i.slot));

  if (context.nextNight?.status === "unset") {
    checks.push({ kind: "fix", text: `Say whether you can make ${context.nextNight.day} ${context.nextNight.label}` });
  }

  let missingEnchants = 0;
  if (context.enchantSlots) {
    for (const item of items) {
      if (context.enchantSlots.has(item.slot) && canHoldEnchant(item) && item.enchants.length === 0) {
        missingEnchants++;
        flag(item, `${slotHas(item.slot, item.slotName)} no enchant`);
      }
    }
  }

  let emptySockets = 0;
  for (const item of items) {
    const empty = item.sockets.filter((s) => !s.filled).length;
    if (empty > 0) {
      emptySockets += empty;
      flag(item, `${slotHas(item.slot, item.slotName)} ${empty === 1 ? "an empty socket" : `${empty} empty sockets`}`);
    }
  }

  const average = profile.equippedItemLevel;
  for (const item of items) {
    const gap = Math.round(average - item.level);
    if (gap >= LOW_SLOT_GAP) flag(item, `${slotIs(item.slot, item.slotName)} ${gap} item levels below your average`);
  }

  if (context.enchantSlots && missingEnchants === 0) checks.push({ kind: "ok", text: "Everything that takes an enchant has one" });
  if (!context.enchantSlots) checks.push({ kind: "info", text: "Enchants are checked once more of the team has been loaded" });
  if (emptySockets === 0) checks.push({ kind: "ok", text: "No empty gem sockets" });

  for (const set of profile.sets) {
    const active = set.bonuses.filter((b) => b.active).map((b) => `${b.count}-piece`);
    checks.push({
      kind: "info",
      text: `${set.name}: ${set.equipped}/${set.total}${active.length ? ` (${active.join(" and ")} bonus active)` : ""}`,
    });
  }

  if (context.teamAverage != null) {
    const diff = Math.round(average - context.teamAverage);
    checks.push({
      kind: "info",
      text:
        diff === 0
          ? "Item level matches the team average"
          : `Item level ${Math.abs(diff)} ${diff > 0 ? "above" : "below"} the team average`,
    });
  }

  if (context.nextNight && context.nextNight.status !== "unset") {
    const { day, label, status } = context.nextNight;
    checks.push({
      kind: status === "yes" ? "ok" : "info",
      text: status === "yes" ? `Marked yes for ${day} ${label}` : `Marked no for ${day} ${label}`,
    });
  }

  return { checks, slotProblems };
}
