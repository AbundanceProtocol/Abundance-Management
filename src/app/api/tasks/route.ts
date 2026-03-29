import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import type { TaskItem, NewTask } from "@/lib/types";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) {
      return unauthorized();
    }

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
    if (!auth.canEdit) {
      return unauthorized();
    }

    const store = await getDataStore();
    const task: NewTask = await request.json();
    const doc = await store.createTask(task);

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) {
      return unauthorized();
    }

    const store = await getDataStore();
    const task: Partial<TaskItem> & { _id: string } = await request.json();
    const { _id, ...update } = task;
    const unsetLegacyUrl = Object.prototype.hasOwnProperty.call(update, "urls");

    await store.updateTask(_id, update, unsetLegacyUrl);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) {
      return unauthorized();
    }

    const store = await getDataStore();
    const { id } = await request.json();

    await store.deleteTaskCascade(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}