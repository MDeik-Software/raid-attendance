import { DroptimizerImport } from "@/components/HomeControls";
import type { DroptimizerReport, Upgrade } from "@/lib/droptimizer";
import type { Region } from "@/lib/regions";
import { ago } from "@/lib/time";

/** Raidbots' slot names in Droptimizer reports, as the app shows them. */
const SLOT_NAMES: Record<string, string> = {
  head: "Head",
  neck: "Neck",
  shoulder: "Shoulders",
  back: "Back",
  chest: "Chest",
  wrist: "Wrists",
  hands: "Hands",
  waist: "Waist",
  legs: "Legs",
  feet: "Feet",
  finger1: "Ring",
  finger2: "Ring",
  trinket1: "Trinket",
  trinket2: "Trinket",
  main_hand: "Main hand",
  off_hand: "Off hand",
};

/** Smaller changes are noise in the sim, not upgrades. */
const MIN_PERCENT = 0.05;

/** How many of a boss's upgrades to list before "and N more". */
const PER_BOSS = 2;

function itemUrl(u: Upgrade): string {
  const params = new URLSearchParams({ ilvl: String(u.itemLevel) });
  if (u.bonusIds.length) params.set("bonus", u.bonusIds.join(":"));
  return `https://www.wowhead.com/item=${u.itemId}?${params}`.replace(/%3A/g, ":");
}

type Boss = { key: string; name: string; instanceName: string; order: number; upgrades: Upgrade[] };

function byBoss(upgrades: Upgrade[]): { withUpgrades: Boss[]; without: Boss[] } {
  const bosses = new Map<string, Boss>();
  for (const u of upgrades) {
    const key = `${u.instanceId}:${u.encounterId}`;
    const boss = bosses.get(key) ?? { key, name: u.encounterName, instanceName: u.instanceName, order: u.encounterOrder, upgrades: [] };
    boss.upgrades.push(u);
    bosses.set(key, boss);
  }
  const list = [...bosses.values()].map((b) => ({ ...b, upgrades: b.upgrades.filter((u) => u.percent >= MIN_PERCENT).sort((x, y) => y.gain - x.gain) }));
  // The main raid (most bosses in the report) first, then other sources; bosses in their in-game order.
  const size = new Map<string, number>();
  for (const b of list) size.set(b.instanceName, (size.get(b.instanceName) ?? 0) + 1);
  const sorted = list.sort(
    (a, b) => size.get(b.instanceName)! - size.get(a.instanceName)! || a.instanceName.localeCompare(b.instanceName) || a.order - b.order,
  );
  return { withUpgrades: sorted.filter((b) => b.upgrades.length > 0), without: sorted.filter((b) => b.upgrades.length === 0) };
}

export function DroptimizerCard({
  memberId,
  name,
  region,
  realmSlug,
  report,
}: {
  memberId: number;
  name: string;
  region: Region;
  realmSlug: string;
  report: DroptimizerReport | null;
}) {
  const runUrl = `https://www.raidbots.com/simbot/droptimizer?${new URLSearchParams({ region, realm: realmSlug, name })}`;
  const bosses = report ? byBoss(report.upgrades) : null;
  const instances = bosses ? [...new Set(bosses.withUpgrades.map((b) => b.instanceName))] : [];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Droptimizer</h2>
        {report && (
          <span className="text-xs text-muted">
            {report.title} · simmed {ago(report.simmedAt)} ·{" "}
            <a
              href={`https://www.raidbots.com/simbot/report/${report.reportId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              open report
            </a>
          </span>
        )}
      </div>

      {bosses ? (
        bosses.withUpgrades.length === 0 ? (
          <p className="text-sm text-muted">Nothing in this report would be an upgrade for {name}.</p>
        ) : (
          <div className="space-y-3">
            {instances.map((instance) => (
              <div key={instance}>
                {instances.length > 1 && <h3 className="mb-1 text-xs uppercase tracking-wide text-muted">{instance}</h3>}
                <ul className="divide-y divide-border/60 text-sm">
                  {bosses.withUpgrades
                    .filter((b) => b.instanceName === instance)
                    .map((boss) => (
                      <li key={boss.key} className="flex gap-3 py-1.5">
                        <span className="w-40 shrink-0 truncate text-muted" title={boss.name}>
                          {boss.name}
                        </span>
                        <span className="min-w-0 flex-1 space-y-0.5">
                          {boss.upgrades.slice(0, PER_BOSS).map((u) => (
                            <span key={u.itemId} className="flex items-baseline gap-2">
                              <a
                                href={itemUrl(u)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 truncate text-[#c69bff] hover:underline"
                                title={u.name ?? undefined}
                              >
                                {u.name ?? `${SLOT_NAMES[u.slot] ?? u.slot} (item ${u.itemId})`}
                              </a>
                              <span className="shrink-0 text-xs text-muted">{SLOT_NAMES[u.slot] ?? u.slot}</span>
                              <span className="ml-auto shrink-0 tabular-nums text-emerald-300">+{u.percent.toFixed(1)}%</span>
                            </span>
                          ))}
                          {boss.upgrades.length > PER_BOSS && (
                            <span className="block text-xs text-muted">and {boss.upgrades.length - PER_BOSS} more</span>
                          )}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            {bosses.without.length > 0 && (
              <p className="text-xs text-muted">No upgrade from {bosses.without.map((b) => b.name).join(", ")}.</p>
            )}
          </div>
        )
      ) : (
        <p className="text-sm text-muted">
          Finds the raid drops that would help {name} most. Raidbots opens in a new tab with this character filled in,
          and the sim runs on your own Raidbots account.
        </p>
      )}

      <a
        href={runUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
      >
        {report ? "Run Droptimizer again" : "Run Droptimizer"}
      </a>
      <DroptimizerImport memberId={memberId} hasReport={report != null} />
    </div>
  );
}
