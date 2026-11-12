import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { characterKey } from "./claims";
import { getSettings, isOnTeam, listAccountMembers, listMembers } from "./repo";
import { SESSION_COOKIE, destroySession, getCurrentUser, type CurrentUser } from "./session";

/*
 * Who may see the raid team and its availability: officers (ADMIN_BATTLETAGS), and players with at least
 * one raid team character on their Battle.net account, whether or not they ticked it yet. Everyone else is
 * turned away at sign-in, and loses access on their next request if they drop off the team later.
 */

/** Whether any of these characters (from Battle.net, at sign-in) is on the raid team. */
export async function anyOnTeam(characters: { realmSlug: string; id: number }[]): Promise<boolean> {
  const [settings, members] = await Promise.all([getSettings(), listMembers()]);
  const team = new Set(members.filter((m) => isOnTeam(m, settings)).map(characterKey));
  return characters.some((c) => team.has(characterKey({ realmSlug: c.realmSlug, characterId: c.id })));
}

export type RosterAccess = { user: CurrentUser | null; allowed: boolean };

/** The signed-in user and whether they may see the raid team, checked against the current team. */
export const getRosterAccess = cache(async (): Promise<RosterAccess> => {
  const user = await getCurrentUser();
  if (!user) return { user: null, allowed: false };
  if (user.isAdmin) return { user, allowed: true };
  const [settings, mine] = await Promise.all([getSettings(), listAccountMembers(user.id)]);
  return { user, allowed: mine.some((m) => isOnTeam(m, settings)) };
});

/**
 * For pages and form actions: sends signed-out visitors to sign in, and ends the session of anyone who is
 * no longer on the raid team before sending them to the sign-in page with the reason.
 */
export async function requireRosterAccess(): Promise<CurrentUser> {
  const { user, allowed } = await getRosterAccess();
  if (!user) redirect("/login");
  if (!allowed) {
    await destroySession((await cookies()).get(SESSION_COOKIE)?.value);
    redirect("/login?error=team");
  }
  return user;
}
