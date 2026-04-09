import { NextResponse } from "next/server";
import { getAuthState, getSessionFromRequest, getVerifiedSessionPayload, isAuthDisabled, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";

/** DELETE — remove stored OAuth tokens and clear GCal fields from all tasks. */
export async function DELETE(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();

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

  if (!userId) return NextResponse.json({ error: "Could not resolve user." }, { status: 401 });

  await store.deleteGoogleOAuthToken(userId);
  await store.clearGoogleCalendarFieldsOnAllTasks();

  return NextResponse.json({ success: true });
}
