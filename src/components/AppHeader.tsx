import Link from "next/link";
import type { CurrentUser } from "@/lib/session";

export function AppHeader({ user, active }: { user: CurrentUser; active: "grid" | "admin" }) {
  const tab = (isActive: boolean) =>
    `rounded px-3 py-1.5 text-sm ${isActive ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`;

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
      <span className="mr-2 font-semibold tracking-wide">Raid Roster</span>
      <nav className="flex gap-1">
        <Link href="/" className={tab(active === "grid")}>
          Availability
        </Link>
        {user.isAdmin && (
          <Link href="/admin" className={tab(active === "admin")}>
            Roster &amp; settings
          </Link>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="text-muted">{user.battletag}</span>
        <form action="/api/auth/logout" method="post">
          <button className="rounded border border-border px-3 py-1 text-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
