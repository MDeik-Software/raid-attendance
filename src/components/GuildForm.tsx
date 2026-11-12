"use client";

import { useState, useTransition } from "react";
import { importGuildAction, listRealmsAction } from "@/app/actions";
import type { Realm } from "@/lib/bnet";
import { REGIONS, REGION_NAMES, isRegion, type Region } from "@/lib/regions";
import { SubmitButton } from "./SubmitButton";

const input = "rounded border border-border bg-background px-2 py-1.5 text-sm";

/** Region → realm → guild name. Changing the region loads that region's realm list. */
export function GuildForm({
  initialRegion,
  initialRealms,
  initialRealmsError,
  realmSlug,
  guildName,
  hasGuild,
}: {
  initialRegion: Region;
  initialRealms: Realm[];
  initialRealmsError: string | null;
  realmSlug: string;
  guildName: string;
  hasGuild: boolean;
}) {
  const [region, setRegion] = useState(initialRegion);
  const [realms, setRealms] = useState(initialRealms);
  const [realm, setRealm] = useState(realmSlug);
  const [error, setError] = useState(initialRealmsError);
  const [loading, startLoading] = useTransition();

  function loadRealms(next: Region) {
    setRegion(next);
    setRealms([]);
    setRealm("");
    setError(null);
    startLoading(async () => {
      const res = await listRealmsAction(next);
      if (res.ok) setRealms(res.realms);
      else setError(res.error);
    });
  }

  return (
    <form action={importGuildAction} className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Region</span>
          <select
            name="region"
            value={region}
            onChange={(e) => isRegion(e.target.value) && loadRealms(e.target.value)}
            className={input}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {REGION_NAMES[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Realm</span>
          <select
            name="realmSlug"
            value={realm}
            onChange={(e) => setRealm(e.target.value)}
            required
            disabled={loading}
            className={`${input} w-56`}
          >
            <option value="" disabled>
              {loading ? "Loading realms…" : "Pick a realm"}
            </option>
            {realms.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Guild name</span>
          <input name="guildName" defaultValue={guildName} required maxLength={24} className={`${input} w-52`} />
        </label>
        <SubmitButton pendingLabel="Fetching…" className="rounded bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110">
          {hasGuild ? "Fetch again" : "Fetch guild"}
        </SubmitButton>
      </div>
      {error && (
        <p className="text-amber-300">
          {error}{" "}
          <button type="button" onClick={() => loadRealms(region)} className="text-accent hover:underline">
            Try again
          </button>
        </p>
      )}
    </form>
  );
}
