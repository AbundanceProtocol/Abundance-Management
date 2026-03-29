import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) {
      return unauthorized();
    }

    const body = await request.json();
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    if (!taskId) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const store = await getDataStore();
    try {
      const result = await store.duplicateTaskSubtree(taskId);
      return NextResponse.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg === "Task not found") {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      if (msg === "Nothing to duplicate") {
        return NextResponse.json({ error: "Nothing to duplicate" }, { status: 400 });
      }
      throw e;
    }
  } catch (error) {
    console.error("POST /api/tasks/duplicate error:", error);
    return NextResponse.json(
      { error: "Failed to duplicate task" },
      { status: 500 }
    );
  }
}