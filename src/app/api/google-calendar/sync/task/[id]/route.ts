import { NextResponse } from "next/server";
import { getAuthState, getSessionFromRequest, getVerifiedSessionPayload, isAuthDisabled, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";
import { deleteCalendarEvent, pushTaskToCalendar } from "@/lib/googleCalendar";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveUserId(request: Request, store: Awaited<ReturnType<typeof getDataStore>>): Promise<string | null> {
  if (isAuthDisabled()) return "dev-user";
  const session = getSessionFromRequest(request) ?? "";
  const claims = getVerifiedSessionPayload(session);
  if (!claims?.u) return null;
  const user = await store.findUserByUsername(claims.u);
  return user?._id ?? null;
}

/** POST — push a single task to Google Calendar (create or update). */
export async function POST(request: Request, ctx: RouteContext) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();

  const { id } = await ctx.params;
  const store = await getDataStore();
  const userId = await resolveUserId(request, store);
  if (!userId) return NextResponse.json({ error: "Could not resolve user." }, { status: 401 });

  const storedToken = await store.getGoogleOAuthToken(userId);
  if (!storedToken) return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 400 });

  const tasks = await store.getTasks();
  const task = tasks.find((t) => t._id === id);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  if (!task.dueDate) return NextResponse.json({ error: "Task has no due date." }, { status: 400 });
  if (task.completed) return NextResponse.json({ error: "Task is completed." }, { status: 400 });
  if (task.repeatFrequency && task.repeatFrequency !== "none") return NextResponse.json({ error: "Recurring tasks are not synced to Google Calendar." }, { status: 400 });

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
  } catch (err) {
    await store
      .updateTask(task._id, { googleCalendarSyncStatus: "error" }, false)
      .catch(() => {});
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Sync failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, pushed: true });
}

/** DELETE — remove a task's calendar event. */
export async function DELETE(request: Request, ctx: RouteContext) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();

  const { id } = await ctx.params;
  const store = await getDataStore();
  const userId = await resolveUserId(request, store);
  if (!userId) return NextResponse.json({ error: "Could not resolve user." }, { status: 401 });

  const storedToken = await store.getGoogleOAuthToken(userId);
  if (!storedToken) return NextResponse.json({ success: true });

  const tasks = await store.getTasks();
  const task = tasks.find((t) => t._id === id);
  if (!task?.googleCalendarEventId) return NextResponse.json({ success: true });

  try {
    await deleteCalendarEvent(task.googleCalendarEventId, storedToken, store);
  } catch {
    // Best-effort; don't block
  }

  await store.updateTask(
    task._id,
    { googleCalendarEventId: null, googleCalendarSyncedAt: null, googleCalendarSyncStatus: null },
    false
  );

  return NextResponse.json({ success: true });
}
