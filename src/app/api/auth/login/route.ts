import { authorizeUrl } from "@/lib/bnet";
import { bnetConfigured } from "@/lib/config";
import { loginError, startSignIn } from "@/lib/auth-cookies";

export async function GET() {
  if (!bnetConfigured()) return loginError("not-configured");
  return startSignIn(authorizeUrl);
}
