import { NextResponse } from "next/server";
import { getAuthState, getSessionFromRequest, getVerifiedSessionPayload, isAuthDisabled, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";
import { getGoogleCredentials } from "@/lib/googleCalendar";

/** GET — return connection status for the current user. Never returns tokens. */
export async function GET(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canRead) return unauthorized();

  const creds = getGoogleCredentials();
  const configured = Boolean(creds);

  const store = await getDataStore();
  let userId: string | null = null;

  if (isAuthDisabled()) {
    userId = "dev-user";
  } else {
    const session = getSessionFromRequest(request) ?? "";
    const claims = getVerifiedSessionPayload(session);
    if (claims?.u) {
      const user = await store.findUserByUsername(claims.u);
      if (user) userId = user._id;
    }
  }

  if (!userId) {
    return NextResponse.json({ configured, connected: false, calendarId: null, connectedAt: null });
  }

  const token = await store.getGoogleOAuthToken(userId);
  return NextResponse.json({
    configured,
    connected: Boolean(token),
    calendarId: token?.calendarId ?? null,
    connectedAt: token?.connectedAt ?? null,
  });
}
