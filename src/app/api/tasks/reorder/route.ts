import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import type { ReorderItem } from "@/lib/dataStore/types";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) {
      return unauthorized();
    }

    const store = await getDataStore();
    const items: ReorderItem[] = await request.json();

    await store.reorderTasks(items);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/tasks/reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder tasks" }, { status: 500 });
  }
}