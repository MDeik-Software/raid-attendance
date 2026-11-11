import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { syncCharacters } from "@/lib/claims";
import { upsertUser } from "@/lib/repo";
import { signedInRedirect } from "@/lib/auth-cookies";

/**
 * Local testing only (DEV_LOGIN=1, never in production): signs in as any BattleTag that "owns" the
 * listed characters, as if Battle.net had returned them. "Name" lands on the realm "dev";
 * "Name-realm" on that realm, with a different Blizzard id per realm.
 */
export async function POST(req: NextRequest) {
  if (!config.devLogin) return new NextResponse(null, { status: 404 });

  const form = await req.formData();
  const battletag = String(form.get("battletag") ?? "").trim();
  if (!battletag) return new NextResponse("BattleTag is required", { status: 400 });

  const characters = String(form.get("characters") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, realm] = entry.split("-", 2).map((s) => s.trim());
      const realmSlug = (realm || "dev").toLowerCase();
      return {
        id: crypto.createHash("sha256").update(`${realmSlug}/${name.toLowerCase()}`).digest().readUInt32BE(0),
        name,
        realmSlug,
        classId: null,
      };
    });

  const userId = await upsertUser(`dev:${battletag.toLowerCase()}`, battletag);
  await syncCharacters(userId, characters);
  return signedInRedirect(userId);
}
