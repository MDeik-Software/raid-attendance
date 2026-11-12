import "server-only";
import { fetchItemNames } from "./bnet";
import { bnetConfigured } from "./config";
import { all, run } from "./db";
import type { Region } from "./regions";
import type { Member } from "./repo";
import { normaliseName } from "./repo";

const RAIDBOTS = "https://www.raidbots.com";

export type Upgrade = {
  itemId: number;
  name: string | null;
  slot: string;
  itemLevel: number;
  bonusIds: number[];
  instanceId: number;
  instanceName: string;
  encounterId: number;
  encounterName: string;
  encounterOrder: number;
  /** Change against the character's current gear, in the report's metric (DPS) and in percent. */
  gain: number;
  percent: number;
};

export type DroptimizerReport = {
  reportId: string;
  title: string;
  simmedAt: string;
  importedAt: string;
  baseline: number;
  upgrades: Upgrade[];
};

/** "https://www.raidbots.com/simbot/report/3qSc…" or the bare id. */
export function reportIdFrom(input: string): string | null {
  const text = input.trim();
  const fromUrl = text.match(/raidbots\.com\/simbot\/report\/([A-Za-z0-9]{8,40})/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9]{8,40}$/.test(text) ? text : null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Who the report is for, from the sim input (armory import, or the SimulationCraft addon's export). */
function reportCharacter(input: string, fallbackName: string): { region: string | null; realm: string | null; name: string } {
  const armory = input.match(/^armory=([a-z]+),([^,\n]+),([^\n]+)$/m);
  if (armory) return { region: armory[1], realm: armory[2].trim(), name: armory[3].trim() };
  const line = (key: string) => input.match(new RegExp(`^${key}=([^\\n]+)$`, "m"))?.[1].trim() ?? null;
  return { region: line("region"), realm: line("server"), name: fallbackName };
}

/** bonus_id lists per profileset, from lines like: profileset."1320/2888/…/head////"+=head=,id=…,bonus_id=4800/4786 */
function bonusIdsByProfileset(input: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const m of input.matchAll(/^profileset\."([^"]+)"\+=[^\n]*?bonus_id=([\d/]+)/gm)) {
    out.set(m[1], m[2].split("/").map(Number).filter(Number.isFinite));
  }
  return out;
}

type Encounters = Map<string, { instanceName: string; name: string; order: number }>;

export type ParsedReport = Omit<DroptimizerReport, "reportId" | "importedAt"> & {
  character: { region: string | null; realm: string | null; name: string };
};

/** Reads Raidbots' data.json of a Droptimizer report. Throws a readable Error when it is not one. */
export function readReport(data: unknown, encounters: Encounters): ParsedReport {
  const root = obj(data);
  const simbot = obj(root.simbot);
  const sim = obj(root.sim);
  if (simbot.simType !== "droptimizer") throw new Error("That report is not a Droptimizer.");

  const metric = typeof obj(sim.options).profileset_metric === "string" ? String(obj(sim.options).profileset_metric) : "dps";
  const baseline = Number(obj(obj(obj(arr(sim.players)[0]).collected_data)[metric]).mean);
  if (!Number.isFinite(baseline) || baseline <= 0) throw new Error("That report has no result for the current gear.");

  const input = typeof simbot.input === "string" ? simbot.input : "";
  const bonuses = bonusIdsByProfileset(input);
  const best = new Map<number, Upgrade>();
  for (const raw of arr(obj(sim.profilesets).results)) {
    const r = obj(raw);
    const name = String(r.name ?? "");
    const [instance, encounter, , itemId, itemLevel, , slot] = name.split("/");
    const mean = Number(r.mean);
    const id = Number(itemId);
    if (!Number.isFinite(mean) || !Number.isInteger(id) || !slot) continue;
    const e = encounters.get(`${instance}:${encounter}`);
    const upgrade: Upgrade = {
      itemId: id,
      name: null,
      slot,
      itemLevel: Number(itemLevel) || 0,
      bonusIds: bonuses.get(name) ?? [],
      instanceId: Number(instance),
      instanceName: e?.instanceName ?? "Unknown source",
      encounterId: Number(encounter),
      encounterName: e?.name ?? "Unknown boss",
      encounterOrder: e?.order ?? 99,
      gain: mean - baseline,
      percent: ((mean - baseline) / baseline) * 100,
    };
    // Rings and trinkets are tried in both slots; keep the better one.
    const seen = best.get(id);
    if (!seen || upgrade.gain > seen.gain) best.set(id, upgrade);
  }

  const timestamp = Number(root.timestamp);
  const title = String(obj(simbot.meta).title ?? simbot.publicTitle ?? "Droptimizer").replace(/^Droptimizer\s*•\s*/, "");
  return {
    character: reportCharacter(input, String(simbot.player ?? "")),
    title,
    simmedAt: new Date(Number.isFinite(timestamp) && timestamp > 0 ? timestamp * 1000 : Date.now()).toISOString(),
    baseline,
    upgrades: [...best.values()].sort((a, b) => b.gain - a.gain),
  };
}

// Boss and instance names change once a season; keep them a day.
let encounterCache: { value: Encounters; expiresAt: number } | undefined;

async function encounterNames(): Promise<Encounters> {
  if (encounterCache && encounterCache.expiresAt > Date.now()) return encounterCache.value;
  const res = await fetch(`${RAIDBOTS}/static/data/live/instances.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Raidbots instance list failed: HTTP ${res.status}`);
  const value: Encounters = new Map();
  for (const raw of arr(await res.json())) {
    const instance = obj(raw);
    for (const e of arr(instance.encounters).map(obj)) {
      value.set(`${instance.id}:${e.id}`, {
        instanceName: String(instance.name ?? ""),
        name: String(e.name ?? ""),
        order: typeof e.order === "number" ? e.order : 99,
      });
    }
  }
  encounterCache = { value, expiresAt: Date.now() + 86_400_000 };
  return value;
}

/** Fetches a report from Raidbots and checks it is a Droptimizer for this character. */
export async function fetchDroptimizer(reportId: string, member: Member, region: Region): Promise<DroptimizerReport> {
  const res = await fetch(`${RAIDBOTS}/reports/${reportId}/data.json`, { cache: "no-store" });
  // Raidbots' file storage answers 403 rather than 404 for a report that does not exist (or has expired).
  if (res.status === 403 || res.status === 404) {
    throw new Error("Raidbots has no report with that link. Check it, and note that reports expire after 28 days.");
  }
  if (!res.ok) throw new Error("Raidbots did not answer. Try again in a minute.");
  const parsed = readReport(await res.json(), await encounterNames());

  const who = parsed.character;
  const sameName = normaliseName(who.name) === normaliseName(member.name);
  // Raidbots names realms by slug ("tarren-mill"); a typed name ("Tarren Mill", "Kel'Thuzad") becomes one.
  const sameRealm = !who.realm || who.realm.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-") === member.realmSlug;
  if (!sameName || !sameRealm) {
    throw new Error(`That report is for ${who.name}${who.realm ? `-${who.realm}` : ""}, not ${member.name}.`);
  }
  if (who.region && who.region !== region) throw new Error(`That report is for the ${who.region.toUpperCase()} region.`);

  if (bnetConfigured()) {
    try {
      const names = await fetchItemNames(region, parsed.upgrades.map((u) => u.itemId));
      for (const u of parsed.upgrades) u.name = names.get(u.itemId) ?? null;
    } catch (err) {
      console.error("Item names for a Droptimizer report could not be fetched", err);
    }
  }
  return { reportId, title: parsed.title, simmedAt: parsed.simmedAt, importedAt: new Date().toISOString(), baseline: parsed.baseline, upgrades: parsed.upgrades };
}

export async function saveDroptimizer(member: Member, report: DroptimizerReport, userId: number) {
  await run(
    `INSERT INTO droptimizer_reports
       (realm_slug, character_id, report_id, title, simmed_at, imported_at, imported_by_user_id, baseline, upgrades)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(realm_slug, character_id) DO UPDATE SET
       report_id = excluded.report_id, title = excluded.title, simmed_at = excluded.simmed_at,
       imported_at = excluded.imported_at, imported_by_user_id = excluded.imported_by_user_id,
       baseline = excluded.baseline, upgrades = excluded.upgrades`,
    [
      member.realmSlug,
      member.characterId,
      report.reportId,
      report.title,
      report.simmedAt,
      report.importedAt,
      userId,
      report.baseline,
      JSON.stringify(report.upgrades),
    ],
  );
}

export async function getDroptimizer(member: Member): Promise<DroptimizerReport | null> {
  const row = (
    await all<{ reportId: string; title: string; simmedAt: string; importedAt: string; baseline: number; upgrades: string }>(
      `SELECT report_id AS reportId, title, simmed_at AS simmedAt, imported_at AS importedAt, baseline, upgrades
       FROM droptimizer_reports WHERE realm_slug = ? AND character_id = ?`,
      [member.realmSlug, member.characterId],
    )
  )[0];
  return row ? { ...row, upgrades: JSON.parse(row.upgrades) as Upgrade[] } : null;
}

export function reportUrl(reportId: string): string {
  return `${RAIDBOTS}/simbot/report/${reportId}`;
}
