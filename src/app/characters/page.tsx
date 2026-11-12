import { saveActiveCharactersAction } from "@/app/actions";
import { AppHeader } from "@/components/AppHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireRosterAccess } from "@/lib/access";
import { characterKey, listAccountCharacters } from "@/lib/claims";
import { classById } from "@/lib/classes";
import { getSettings, isOnTeam, listMembers } from "@/lib/repo";

export default async function CharactersPage() {
  const user = await requireRosterAccess();

  const [settings, characters, members] = await Promise.all([
    getSettings(),
    listAccountCharacters(user.id),
    listMembers(),
  ]);
  const team = new Set(members.filter((m) => isOnTeam(m, settings)).map(characterKey));

  const shown = characters
    .filter((c) => c.level >= settings.maxLevel)
    .map((c) => ({ ...c, key: characterKey(c), onTeam: team.has(characterKey(c)) }))
    .sort((a, b) => Number(b.onTeam) - Number(a.onTeam) || a.name.localeCompare(b.name));
  const hidden = characters.length - shown.length;

  return (
    <>
      <AppHeader user={user} active="characters" />
      <main className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <div>
          <h1 className="text-lg font-semibold">My characters</h1>
          <p className="mt-1 text-sm text-muted">
            Tick the characters you raid on. Ticking a raid team character claims its row on the grid, so you can mark
            your nights on it. These are your level {settings.maxLevel} characters as Battle.net listed them when you
            signed in; sign out and in again to refresh the list.
          </p>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            None of your characters are level {settings.maxLevel} yet
            {hidden > 0 ? ` (${hidden} lower-level ${hidden === 1 ? "character is" : "characters are"} hidden)` : ""}.
          </p>
        ) : (
          <form action={saveActiveCharactersAction} className="space-y-3">
            <div className="space-y-1.5">
              {shown.map((c) => {
                const cls = classById(c.classId ?? 0);
                return (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 hover:bg-surface-2"
                    style={{ boxShadow: `inset 3px 0 0 ${cls.color}` }}
                  >
                    <input type="checkbox" name="active" value={c.key} defaultChecked={c.active} className="h-4 w-4" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {cls.name} · {c.realmName}
                      </span>
                    </span>
                    {c.onTeam ? (
                      <span className="rounded bg-emerald-950/70 px-2 py-0.5 text-xs text-emerald-200">On the raid team</span>
                    ) : (
                      <span className="text-xs text-muted">Not on the raid team</span>
                    )}
                  </label>
                );
              })}
            </div>
            {hidden > 0 && (
              <p className="text-xs text-muted">
                {hidden} lower-level {hidden === 1 ? "character is" : "characters are"} not shown.
              </p>
            )}
            <SubmitButton className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
              Save
            </SubmitButton>
          </form>
        )}
      </main>
    </>
  );
}
