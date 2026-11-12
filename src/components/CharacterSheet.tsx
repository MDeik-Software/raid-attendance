import Image from "next/image";
import { DroptimizerCard } from "@/components/DroptimizerCard";
import { CopyButton } from "@/components/HomeControls";
import { classById } from "@/lib/classes";
import type { DroptimizerReport } from "@/lib/droptimizer";
import type { CharacterProfile, ProfileItem } from "@/lib/profile";
import type { Check, Readiness } from "@/lib/readiness";
import type { Region } from "@/lib/regions";
import { SLOT_LABELS } from "@/lib/slots";

const QUALITY_COLORS: Record<string, string> = {
  POOR: "#9d9d9d",
  COMMON: "#ffffff",
  UNCOMMON: "#1eff00",
  RARE: "#0070dd",
  EPIC: "#a335ee",
  LEGENDARY: "#ff8000",
  ARTIFACT: "#e6cc80",
  HEIRLOOM: "#00ccff",
};

const LEFT_SLOTS = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "MAIN_HAND", "OFF_HAND"];
const RIGHT_SLOTS = ["HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2"];

function itemUrl(item: ProfileItem): string {
  const bonus = item.bonusIds.length ? `?bonus=${item.bonusIds.join(":")}` : "";
  return `https://www.wowhead.com/item=${item.itemId}${bonus}`;
}

function WarnIcon({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-amber-400" role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M8 1.5 15 14H1L8 1.5Z" fill="currentColor" opacity="0.2" />
      <path d="M8 1.5 15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

function SlotRow({ slot, item, problems }: { slot: string; item: ProfileItem | undefined; problems: string[] }) {
  if (!item) {
    return (
      <div className="flex items-center gap-2 border-b border-border/60 py-1.5 last:border-0">
        <span className="w-16 shrink-0 text-xs text-muted">{SLOT_LABELS[slot]}</span>
        <span className="text-sm text-muted">Empty</span>
      </div>
    );
  }
  const details = [...item.enchants, ...item.sockets.map((s) => s.gem ?? "Empty socket")];
  return (
    <div className="flex items-center gap-2 border-b border-border/60 py-1.5 last:border-0">
      <span className="w-16 shrink-0 text-xs text-muted">{SLOT_LABELS[slot]}</span>
      <div className="min-w-0 flex-1">
        <a
          href={itemUrl(item)}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm hover:underline"
          style={{ color: QUALITY_COLORS[item.quality] ?? QUALITY_COLORS.COMMON }}
        >
          {item.name}
        </a>
        {details.length > 0 && <div className="truncate text-xs text-muted">{details.join(" · ")}</div>}
      </div>
      {problems.length > 0 && <WarnIcon title={problems.join("\n")} />}
      <span className={`w-9 shrink-0 text-right text-sm tabular-nums ${problems.length ? "text-amber-300" : ""}`}>
        {item.level}
      </span>
    </div>
  );
}

function CheckLine({ check }: { check: Check }) {
  const mark =
    check.kind === "fix" ? (
      <WarnIcon title="To fix" />
    ) : check.kind === "ok" ? (
      <span className="w-4 shrink-0 text-center text-emerald-400" aria-label="Done">
        ✓
      </span>
    ) : (
      <span className="w-4 shrink-0 text-center text-muted" aria-hidden="true">
        •
      </span>
    );
  return (
    <li className={`flex items-start gap-2 ${check.kind === "fix" ? "" : "text-muted"}`}>
      <span className="mt-0.5 flex">{mark}</span>
      <span>{check.text}</span>
    </li>
  );
}

const pct = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);

export function CharacterSheet({
  memberId,
  profile,
  region,
  realmSlug,
  readiness,
  teamAverage,
  updated,
  droptimizer,
}: {
  memberId: number;
  droptimizer: DroptimizerReport | null;
  profile: CharacterProfile;
  region: Region;
  realmSlug: string;
  readiness: Readiness;
  teamAverage: number | null;
  /** "updated 12 min ago", or a note that the sheet could not be refreshed. */
  updated: string;
}) {
  const cls = classById(profile.classId);
  const bySlot = new Map(profile.items.map((i) => [i.slot, i]));
  const fixes = readiness.checks.filter((c) => c.kind === "fix");
  const ordered = [...fixes, ...readiness.checks.filter((c) => c.kind !== "fix")];
  const render = profile.media.main ?? profile.media.inset;

  const slots = (list: string[]) =>
    list
      .filter((slot) => slot !== "OFF_HAND" || bySlot.has(slot))
      .map((slot) => <SlotRow key={slot} slot={slot} item={bySlot.get(slot)} problems={readiness.slotProblems.get(slot) ?? []} />);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        {profile.media.avatar ? (
          <Image
            src={profile.media.avatar}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 rounded-full border-2"
            style={{ borderColor: cls.color }}
          />
        ) : (
          <div className="h-12 w-12 rounded-full border-2 bg-surface-2" style={{ borderColor: cls.color }} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold" style={{ color: cls.color }}>
            {profile.name}
          </h1>
          <p className="text-sm text-muted">
            {[profile.specName && `${profile.specName} ${cls.name.toLowerCase()}`, profile.heroTree, profile.realmName]
              .filter(Boolean)
              .join(" · ")}{" "}
            · {updated}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{profile.equippedItemLevel}</div>
          <div className="text-xs text-muted">
            item level{teamAverage != null ? ` · team average ${Math.round(teamAverage)}` : ""}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="min-w-40">
          <h2 className="font-semibold">Raid readiness</h2>
          <span
            className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${
              fixes.length ? "bg-amber-950/70 text-amber-200" : "bg-emerald-950/70 text-emerald-200"
            }`}
          >
            {fixes.length === 0 ? "Ready" : fixes.length === 1 ? "1 thing to fix" : `${fixes.length} things to fix`}
          </span>
        </div>
        <ul className="min-w-60 flex-1 space-y-1 text-sm">
          {ordered.map((check, i) => (
            <CheckLine key={i} check={check} />
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-surface px-3 py-1">{slots(LEFT_SLOTS)}</div>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
          {render ? (
            <Image
              src={render}
              alt={`${profile.name}'s character`}
              width={400}
              height={300}
              unoptimized
              className="h-56 w-full object-contain"
            />
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-muted">No picture</div>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {profile.stats.primary && (
              <>
                <dt className="text-muted">{profile.stats.primary.name}</dt>
                <dd className="text-right tabular-nums">{profile.stats.primary.value.toLocaleString("en")}</dd>
              </>
            )}
            <dt className="text-muted">Crit</dt>
            <dd className="text-right tabular-nums">{pct(profile.stats.crit)}</dd>
            <dt className="text-muted">Haste</dt>
            <dd className="text-right tabular-nums">{pct(profile.stats.haste)}</dd>
            <dt className="text-muted">Mastery</dt>
            <dd className="text-right tabular-nums">{pct(profile.stats.mastery)}</dd>
            <dt className="text-muted">Versatility</dt>
            <dd className="text-right tabular-nums">{pct(profile.stats.versatility)}</dd>
          </dl>
        </div>
        <div className="rounded-lg border border-border bg-surface px-3 py-1">{slots(RIGHT_SLOTS)}</div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">Talents</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Spec</dt>
            <dd>{profile.specName ?? "–"}</dd>
            <dt className="text-muted">Hero talents</dt>
            <dd>{profile.heroTree ?? "–"}</dd>
          </dl>
          {profile.loadoutCode ? (
            <div className="flex flex-wrap gap-2">
              <CopyButton text={profile.loadoutCode} label="Copy talent string" />
              <a
                href={`https://www.wowhead.com/talent-calc/blizzard/${encodeURIComponent(profile.loadoutCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Open in talent calculator
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted">Battle.net did not share the active talent loadout.</p>
          )}
        </div>
        <DroptimizerCard
          memberId={memberId}
          name={profile.name}
          region={region}
          realmSlug={realmSlug}
          report={droptimizer}
        />
      </section>
    </div>
  );
}
