import { NextResponse } from "next/server";
import { getAuthState, resolveEffectiveUserId, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";

/** DELETE — remove stored OAuth tokens and clear GCal fields from all tasks. */
export async function DELETE(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();

  const store = await getDataStore();
  const userId = await resolveEffectiveUserId(request, store);

  if (!userId) return NextResponse.json({ error: "Could not resolve user." }, { status: 401 });

  await store.deleteGoogleOAuthToken(userId);
  await store.clearGoogleCalendarFieldsOnAllTasks();

  return NextResponse.json({ success: true });
}
