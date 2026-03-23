import { cookies } from "next/headers";
import {
  isAuthDisabled,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth";

/** True when the user has a valid edit session (or auth is skipped for local dev). */
export async function hasServerEditSession(): Promise<boolean> {
  if (isAuthDisabled()) return true;
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(c);
}
