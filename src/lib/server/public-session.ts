import { auth } from "@/auth";
import { isWorkspaceSession } from "@/lib/auth/session";

/** Marketing chrome only — JWT presence, no database round-trip. */
export async function getPublicSignedIn(): Promise<boolean> {
  try {
    return isWorkspaceSession(await auth());
  } catch {
    return false;
  }
}
