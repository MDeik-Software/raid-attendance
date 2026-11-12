import { redirect } from "next/navigation";
import { saveRanksAction, saveScheduleAction, saveTeamAction } from "@/app/actions";
import { AppHeader } from "@/components/AppHeader";
import { GuildForm } from "@/components/GuildForm";
import { SubmitButton } from "@/components/SubmitButton";
import { fetchRealms, type Realm } from "@/lib/bnet";
import { classById } from "@/lib/classes";
import { config } from "@/lib/config";
import { WEEKDAYS, WEEK_ORDER } from "@/lib/dates";
import { REGION_NAMES, isRegion, realmLabel } from "@/lib/regions";
import { getSettings, isOnTeam, listMembers, rankLabel, teamByDefault, type Member } from "@/lib/repo";
import { getCurrentUser } from "@/lib/session";

const input = "rounded border border-border bg-background px-2 py-1.5 text-sm";
const button = "rounded border border-border px-2.5 py-1.5 text-sm hover:bg-surface-2";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");

  const { error, ok } = await searchParams;
  const [settings, members] = await Promise.all([getSettings(), listMembers()]);

  const region = settings.guild?.region ?? (isRegion(config.bnetRegion) ? config.bnetRegion : "eu");
  const realms = await fetchRealms(region).catch((err): Realm[] | null => {
    console.error("Realm list failed", err);
    return null;
  });

  const ranks = [...new Set(members.map((m) => m.rank))].sort((a, b) => a - b);
  const candidates = members.filter((m) => teamByDefault(m, settings) || m.teamOverride === true);
  const teamSize = members.filter((m) => isOnTeam(m, settings)).length;

  return (
    <>
      <AppHeader user={user} active="admin" />
      <main className="mx-auto w-full max-w-4xl space-y-6 p-4">
        {typeof error === "string" && (
          <p className="rounded bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</p>
        )}
        {typeof ok === "string" && (
          <p className="rounded bg-emerald-950/60 px-3 py-2 text-sm text-emerald-200">{ok}</p>
        )}

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">1. Guild</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            Fetches the guild&apos;s member list from Battle.net. Fetch again any time to pick up new members, level-ups
            and rank changes. Switching to another guild starts over: the old team and all answers are deleted.
          </p>
          <GuildForm
            initialRegion={region}
            initialRealms={realms ?? []}
            initialRealmsError={realms ? null : "Battle.net did not send the realm list."}
            realmSlug={settings.guild?.realmSlug ?? ""}
            guildName={settings.guild?.name ?? ""}
            hasGuild={Boolean(settings.guild)}
          />
          {settings.guild && (
            <p className="mt-3 text-sm text-muted">
              <span className="font-medium text-foreground">{settings.guild.name}</span> on {settings.guild.realmName} (
              {REGION_NAMES[settings.guild.region]}) · {members.length} members · fetched {formatTime(settings.guild.fetchedAt)}
            </p>
          )}
        </section>

        {ranks.length > 0 && (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="font-semibold">2. Ranks</h2>
            <p className="mb-3 mt-1 text-sm text-muted">
              Battle.net only shares rank numbers (0 is the Guild Master), so name them if that helps. Tick the ranks
              the raid team comes from: their members at max level join the team.
            </p>
            <form action={saveRanksAction} className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted">Max level</span>
                <input
                  type="number"
                  name="maxLevel"
                  min={1}
                  max={200}
                  defaultValue={settings.maxLevel}
                  required
                  className={`${input} w-20`}
                />
                <span className="text-xs text-muted">Players and the team only see characters at this level.</span>
              </label>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Raid rank</th>
                      <th className="py-1 pr-3 font-medium">Name</th>
                      <th className="py-1 pr-3 text-right font-medium">Members</th>
                      <th className="py-1 pr-3 text-right font-medium">At {settings.maxLevel}</th>
                      <th className="py-1 font-medium">For example</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranks.map((rank) => {
                      const inRank = members.filter((m) => m.rank === rank && m.inGuild);
                      const atMax = inRank.filter((m) => m.level >= settings.maxLevel);
                      return (
                        <tr key={rank} className="border-t border-border">
                          <td className="py-1.5 pr-3">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="raidRanks"
                                value={rank}
                                defaultChecked={settings.raidRanks.includes(rank)}
                              />
                              Rank {rank}
                            </label>
                          </td>
                          <td className="py-1.5 pr-3">
                            <input
                              name={`rankName_${rank}`}
                              defaultValue={settings.rankNames[rank] ?? ""}
                              placeholder={rankLabel(rank, { ...settings, rankNames: {} })}
                              maxLength={24}
                              className={`${input} w-36`}
                            />
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{inRank.length}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{atMax.length}</td>
                          <td className="py-1.5 text-xs text-muted">
                            {(atMax.length ? atMax : inRank)
                              .slice(0, 4)
                              .map((m) => m.name)
                              .join(", ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <SubmitButton className={button}>Save ranks</SubmitButton>
            </form>
          </section>
        )}

        {settings.guild && (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="font-semibold">3. Raid team</h2>
            <p className="mb-3 mt-1 text-sm text-muted">
              Untick anyone who is not on the team; only ticked characters get a row on the grid. Players claim their
              own characters on <em>My characters</em>; <Unclaimed /> means nobody has yet. The block number groups
              rows on the grid, for example 1 tanks, 2 healers, 3 melee, 4 ranged.
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted">Tick at least one rank above to build the team.</p>
            ) : (
              <form action={saveTeamAction} className="space-y-3">
                <p className="text-sm">
                  <span className="font-medium">{teamSize}</span>{" "}
                  <span className="text-muted">of {candidates.length} characters are on the team.</span>
                </p>
                <div className="space-y-1">
                  {candidates.map((m) => (
                    <TeamRow
                      key={m.id}
                      member={m}
                      onTeam={isOnTeam(m, settings)}
                      rank={rankLabel(m.rank, settings)}
                      showRealm={m.realmSlug !== settings.guild?.realmSlug}
                    />
                  ))}
                </div>
                <SubmitButton className={button}>Save team</SubmitButton>
              </form>
            )}
          </section>
        )}

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 font-semibold">Schedule</h2>
          <form action={saveScheduleAction} className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-muted">First night</span>
                <input type="date" name="startDate" defaultValue={settings.startDate} required className={input} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Last night</span>
                <input type="date" name="endDate" defaultValue={settings.endDate} required className={input} />
              </label>
            </div>
            <DayPicker name="raidDays" label="Raid nights" selected={settings.raidDays} />
            <DayPicker
              name="defaultYesDays"
              label="Nights that start as yes (until the player changes them)"
              selected={settings.defaultYesDays}
            />
            <SubmitButton className={button}>Save schedule</SubmitButton>
          </form>
        </section>
      </main>
    </>
  );
}

function TeamRow({
  member: m,
  onTeam,
  rank,
  showRealm,
}: {
  member: Member;
  onTeam: boolean;
  rank: string;
  showRealm: boolean;
}) {
  const cls = classById(m.classId);
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border px-2 py-1.5 text-sm"
      style={{ boxShadow: `inset 3px 0 0 ${cls.color}` }}
    >
      <input type="hidden" name="shown" value={m.id} />
      <label className="flex w-44 items-center gap-2 font-medium" title={cls.name}>
        <input type="checkbox" name="onTeam" value={m.id} defaultChecked={onTeam} />
        {m.name}
      </label>
      <span className="w-40 text-xs text-muted">
        {rank} · {m.level}
        {showRealm && ` · ${realmLabel(m.realmSlug)}`}
      </span>
      {!m.inGuild && <span className="text-xs text-amber-300">Left the guild</span>}
      <span className="ml-auto text-xs">
        {m.ownerBattletag ? <span className="text-muted">Claimed by {m.ownerBattletag}</span> : <Unclaimed />}
      </span>
      <label className="flex items-center gap-1 text-xs text-muted">
        Block
        <input
          type="number"
          name={`group_${m.id}`}
          min={1}
          max={9}
          defaultValue={m.groupNo}
          className={`${input} w-14 py-1`}
        />
      </label>
    </div>
  );
}

function Unclaimed() {
  return (
    <span className="inline-flex items-center gap-1 text-amber-300">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-black">
        !
      </span>
      Not claimed
    </span>
  );
}

function DayPicker({ name, label, selected }: { name: string; label: string; selected: number[] }) {
  return (
    <fieldset>
      <legend className="mb-1 text-muted">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {WEEK_ORDER.map((d) => (
          <label key={d} className="flex items-center gap-1.5">
            <input type="checkbox" name={name} value={d} defaultChecked={selected.includes(d)} />
            {WEEKDAYS[d]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
