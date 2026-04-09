import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import type { TaskItem, NewTask } from "@/lib/types";
import { getAuthState, getSessionFromRequest, getVerifiedSessionPayload, isAuthDisabled, unauthorized } from "@/lib/auth";

/** Resolve the current userId from the request (returns null if unavailable). */
async function resolveUserId(
  request: Request,
  store: Awaited<ReturnType<typeof getDataStore>>
): Promise<string | null> {
  if (isAuthDisabled()) return "dev-user";
  const session = getSessionFromRequest(request) ?? "";
  const claims = getVerifiedSessionPayload(session);
  if (!claims?.u) return null;
  const user = await store.findUserByUsername(claims.u);
  return user?._id ?? null;
}

/** Fire-and-forget GCal push for a task after save. */
function triggerCalendarSync(taskId: string, method: "POST" | "DELETE", request: Request): void {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  fetch(`${base}/api/google-calendar/sync/task/${taskId}`, {
    method,
    headers: { cookie: request.headers.get("cookie") ?? "" },
  }).catch(() => {});
}

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) return unauthorized();

    const store = await getDataStore();
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("sectionId");
    const tasks = await store.getTasks(sectionId ? { sectionId } : undefined);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) return unauthorized();

    const store = await getDataStore();
    const task: NewTask = await request.json();
    const doc = await store.createTask(task);

    // If new task has a due date, push to calendar
    if (doc.dueDate && doc.parentId === null) {
      triggerCalendarSync(doc._id, "POST", request);
    }

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) return unauthorized();

    const store = await getDataStore();
    const task: Partial<TaskItem> & { _id: string } = await request.json();
    const { _id, ...update } = task;
    const unsetLegacyUrl = Object.prototype.hasOwnProperty.call(update, "urls");

    await store.updateTask(_id, update, unsetLegacyUrl);

    // GCal sync: delete event if completed or dueDate cleared; push if dueDate present
    const userId = await resolveUserId(request, store).catch(() => null);
    if (userId) {
      const token = await store.getGoogleOAuthToken(userId).catch(() => null);
      if (token) {
        const tasks = await store.getTasks();
        const saved = tasks.find((t) => t._id === _id);
        if (saved) {
          const shouldDelete =
            (Object.prototype.hasOwnProperty.call(update, "completed") && update.completed) ||
            (Object.prototype.hasOwnProperty.call(update, "dueDate") && !update.dueDate);
          if (shouldDelete) {
            triggerCalendarSync(_id, "DELETE", request);
          } else if (saved.dueDate && saved.parentId === null) {
            triggerCalendarSync(_id, "POST", request);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) return unauthorized();

    const store = await getDataStore();
    const { id } = await request.json();

    // Delete calendar event before removing task from DB
    triggerCalendarSync(id, "DELETE", request);

    await store.deleteTaskCascade(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
