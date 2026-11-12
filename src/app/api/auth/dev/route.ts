import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { BnetCharacter } from "@/lib/bnet";
import { config } from "@/lib/config";
import { finishSignIn } from "@/lib/auth-cookies";
import { realmLabel } from "@/lib/regions";
import { getSettings, listMembers, normaliseName } from "@/lib/repo";

/**
 * Local testing only (DEV_LOGIN=1, never in production): signs in as any BattleTag whose account "holds"
 * the listed characters, as if Battle.net had returned them. A name that matches an imported guild member
 * ("Name", or "Name-realm" to pick the realm) becomes that exact character; any other name becomes a
 * max-level character on the realm "dev" (or the realm given).
 */
export async function POST(req: NextRequest) {
  if (!config.devLogin) return new NextResponse(null, { status: 404 });

  const form = await req.formData();
  const battletag = String(form.get("battletag") ?? "").trim();
  if (!battletag) return new NextResponse("BattleTag is required", { status: 400 });

  const [settings, members] = await Promise.all([getSettings(), listMembers()]);
  const characters: BnetCharacter[] = String(form.get("characters") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, realm] = entry.split("-", 2).map((s) => s.trim());
      const realmSlug = realm ? realm.toLowerCase().replace(/\s+/g, "-") : undefined;
      const member = members.find(
        (m) => normaliseName(m.name) === normaliseName(name) && (!realmSlug || m.realmSlug === realmSlug),
      );
      if (member) {
        return {
          id: member.characterId,
          name: member.name,
          realmSlug: member.realmSlug,
          realmName: realmLabel(member.realmSlug),
          classId: member.classId,
          level: member.level,
        };
      }
      const slug = realmSlug ?? "dev";
      return {
        id: crypto.createHash("sha256").update(`${slug}/${name.toLowerCase()}`).digest().readUInt32BE(0),
        name,
        realmSlug: slug,
        realmName: realmLabel(slug),
        classId: null,
        level: settings.maxLevel,
      };
    });

  return finishSignIn(`dev:${battletag.toLowerCase()}`, battletag, characters);
}
