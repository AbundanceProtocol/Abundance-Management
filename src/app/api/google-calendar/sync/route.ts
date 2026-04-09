import { NextResponse } from "next/server";
import { getAuthState, getSessionFromRequest, getVerifiedSessionPayload, isAuthDisabled, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";
import { pushTaskToCalendar } from "@/lib/googleCalendar";

/** POST — push all eligible tasks (top-level, has dueDate, not completed) to Google Calendar. */
export async function POST(request: Request) {
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

  const storedToken = await store.getGoogleOAuthToken(userId);
  if (!storedToken) {
    return NextResponse.json({ error: "Google Calendar not connected." }, { status: 400 });
  }

  const allTasks = await store.getTasks();
  const eligible = allTasks.filter(
    (t) => t.parentId === null && t.dueDate && !t.completed && (!t.repeatFrequency || t.repeatFrequency === "none")
  );

  let synced = 0;
  let errors = 0;

  // Sequential to avoid hitting per-second rate limits
  for (const task of eligible) {
    try {
      const eventId = await pushTaskToCalendar(task, storedToken, store);
      await store.updateTask(
        task._id,
        {
          googleCalendarEventId: eventId,
          googleCalendarSyncedAt: new Date().toISOString(),
          googleCalendarSyncStatus: "synced",
        },
        false
      );
      synced++;
    } catch {
      await store
        .updateTask(task._id, { googleCalendarSyncStatus: "error" }, false)
        .catch(() => {});
      errors++;
    }
  }

  return NextResponse.json({ synced, errors, total: eligible.length });
}
