import { NextResponse } from "next/server";
import { getAuthState, resolveEffectiveUserId, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";
import { getGoogleCredentials } from "@/lib/googleCalendar";

/** GET — return connection status for the current user. Never returns tokens. */
export async function GET(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canRead) return unauthorized();

  const store = await getDataStore();
  const creds = await getGoogleCredentials(store);
  const configured = Boolean(creds);

  const userId = await resolveEffectiveUserId(request, store);

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
