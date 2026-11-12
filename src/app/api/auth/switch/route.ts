import { switchAccountUrl } from "@/lib/bnet";
import { bnetConfigured } from "@/lib/config";
import { loginError, startSignIn } from "@/lib/auth-cookies";

/**
 * "Use a different Battle.net account": signs the player out at Battle.net, which then continues to its
 * sign-in page for this app and asks for an account. The sign-in comes back to the callback as usual.
 */
export async function GET() {
  if (!bnetConfigured()) return loginError("not-configured");
  return startSignIn(switchAccountUrl);
}
