import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import type { TaskItem } from "@/lib/types";

/** Recursively propagate hidden status to all descendants. */
function filterTasksForView(tasks: TaskItem[], viewId: string): TaskItem[] {
  const hidden = new Set(
    tasks.filter((t) => t.hiddenFromViews?.includes(viewId)).map((t) => t._id)
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (!hidden.has(t._id) && t.parentId && hidden.has(t.parentId)) {
        hidden.add(t._id);
        changed = true;
      }
    }
  }
  return tasks.filter((t) => !hidden.has(t._id));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const store = await getDataStore();
    const viewToken = await store.getViewTokenByToken(token);
    if (!viewToken) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [sections, allTasks] = await Promise.all([
      store.getSections({ ensureDefaultsIfEmpty: false }),
      store.getTasks(),
    ]);
    const tasks = filterTasksForView(allTasks, viewToken._id);
    return NextResponse.json({ viewName: viewToken.name, sections, tasks });
  } catch (e) {
    console.error("GET /api/shared/[token] error:", e);
    return NextResponse.json({ error: "Failed to load shared view" }, { status: 500 });
  }
}
