import { redirect } from "next/navigation";
import {
  addCharacterAction,
  moveCharacterAction,
  removeCharacterAction,
  resetClaimAction,
  saveSettingsAction,
  updateCharacterAction,
} from "@/app/actions";
import { AppHeader } from "@/components/AppHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CLASSES, classById } from "@/lib/classes";
import { WEEKDAYS, WEEK_ORDER } from "@/lib/dates";
import { getSettings, listRoster } from "@/lib/repo";
import { getCurrentUser } from "@/lib/session";

const input = "rounded border border-border bg-background px-2 py-1.5 text-sm";
const button = "rounded border border-border px-2.5 py-1.5 text-sm hover:bg-surface-2";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");

  const { error, ok } = await searchParams;
  const [settings, roster] = await Promise.all([getSettings(), listRoster()]);

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
          <h2 className="mb-3 font-semibold">Schedule</h2>
          <form action={saveSettingsAction} className="space-y-4 text-sm">
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
            <button className={button}>Save schedule</button>
          </form>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">Roster</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            A player claims a row by signing in with a character of that name; after that only that exact character
            (realm and Battle.net id) can edit it. Reset the claim if a character was claimed by mistake. The block
            number groups rows and draws a line between blocks.
          </p>

          <div className="space-y-1.5">
            {roster.map((c) => {
              const cls = classById(c.classId);
              return (
                <form
                  key={c.id}
                  action={updateCharacterAction}
                  className="flex flex-wrap items-center gap-2 rounded border border-border p-2"
                  style={{ boxShadow: `inset 3px 0 0 ${cls.color}` }}
                >
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} required maxLength={24} className={`${input} w-36`} />
                  <select name="classId" defaultValue={c.classId} className={input} aria-label="Class">
                    {CLASSES.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-sm text-muted">
                    Block
                    <input
                      type="number"
                      name="groupNo"
                      min={1}
                      max={9}
                      defaultValue={c.groupNo}
                      className={`${input} w-14`}
                    />
                  </label>
                  <button className={button}>Save</button>
                  <button formAction={moveCharacterAction} name="direction" value="up" className={button} aria-label="Move up">
                    ↑
                  </button>
                  <button formAction={moveCharacterAction} name="direction" value="down" className={button} aria-label="Move down">
                    ↓
                  </button>

                  <span className="ml-auto text-xs text-muted">
                    {c.bnetCharacterId == null ? (
                      "Unclaimed"
                    ) : (
                      <>
                        Claimed{c.ownerBattletag ? ` by ${c.ownerBattletag}` : ""} · {c.realmSlug}
                      </>
                    )}
                  </span>
                  {c.bnetCharacterId != null && (
                    <ConfirmButton
                      formAction={resetClaimAction}
                      message={`Reset the claim on ${c.name}? The next player who signs in with that character name will own the row.`}
                      className={button}
                    >
                      Reset claim
                    </ConfirmButton>
                  )}
                  <ConfirmButton
                    formAction={removeCharacterAction}
                    message={`Remove ${c.name} from the roster? Their answers are deleted too.`}
                    className={`${button} text-red-300`}
                  >
                    Remove
                  </ConfirmButton>
                </form>
              );
            })}
          </div>

          <form action={addCharacterAction} className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <input name="name" placeholder="Character name" required maxLength={24} className={`${input} w-40`} />
            <select name="classId" defaultValue="" required className={input} aria-label="Class">
              <option value="" disabled>
                Class
              </option>
              {CLASSES.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm text-muted">
              Block
              <input type="number" name="groupNo" min={1} max={9} defaultValue={1} className={`${input} w-14`} />
            </label>
            <button className={button}>Add to roster</button>
          </form>
        </section>
      </main>
    </>
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
