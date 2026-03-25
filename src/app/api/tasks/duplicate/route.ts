import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskItem } from "@/lib/types";
import { ObjectId } from "mongodb";
import { getAuthState, unauthorized } from "@/lib/auth";
import { normalizeUrlsFromDoc } from "@/lib/taskUrls";
import { subtreeNodesPreorder } from "@/lib/duplicateTaskTree";

function mapDoc(t: TaskItem & { _id: unknown; url?: string }): TaskItem {
  const plain = { ...t, _id: String(t._id) } as TaskItem & { url?: string };
  const urls = normalizeUrlsFromDoc(plain);
  const { url: _legacy, ...rest } = plain;
  return { ...rest, urls } as TaskItem;
}

export async function POST(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) {
      return unauthorized();
    }

    const body = await request.json();
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    if (!taskId || !ObjectId.isValid(taskId)) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const col = db.collection("tasks");

    const rootRaw = await col.findOne({ _id: new ObjectId(taskId) });
    if (!rootRaw) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const root = mapDoc(rootRaw as TaskItem & { _id: ObjectId });
    const sectionId = root.sectionId;

    const sectionDocs = await col.find({ sectionId }).toArray();
    const sectionTasks = sectionDocs.map((d) =>
      mapDoc(d as TaskItem & { _id: ObjectId })
    );

    const preorder = subtreeNodesPreorder(sectionTasks, root._id);
    if (preorder.length === 0) {
      return NextResponse.json({ error: "Nothing to duplicate" }, { status: 400 });
    }

    const now = new Date().toISOString();

    await col.updateMany(
      {
        sectionId,
        parentId: root.parentId ?? null,
        order: { $gt: root.order },
      },
      { $inc: { order: 1 } }
    );

    const idMap = new Map<string, ObjectId>();
    const docs: Record<string, unknown>[] = [];

    for (const t of preorder) {
      const newId = new ObjectId();
      idMap.set(t._id, newId);

      let newParentId: string | null;
      if (t._id === root._id) {
        newParentId = root.parentId;
      } else {
        const p = idMap.get(t.parentId!);
        if (!p) {
          return NextResponse.json(
            { error: "Invalid subtree parent chain" },
            { status: 500 }
          );
        }
        newParentId = p.toString();
      }

      const newOrder = t._id === root._id ? root.order + 1 : t.order;

      const baseTitle = (t.title ?? "").trim() || "Untitled";
      const title =
        t._id === root._id ? `${baseTitle} (copy)` : t.title ?? "";

      const {
        _id: _omitId,
        createdAt: _ca,
        updatedAt: _ua,
        ...rest
      } = t;

      docs.push({
        ...rest,
        _id: newId,
        sectionId: t.sectionId,
        parentId: newParentId,
        depth: t.depth,
        order: newOrder,
        title,
        notes: t.notes ?? "",
        urls: [...(t.urls ?? [])],
        tags: [...(t.tags ?? [])],
        completionHistory: [...(t.completionHistory ?? [])],
        createdAt: now,
        updatedAt: now,
      });
    }

    if (docs.length > 0) {
      await col.insertMany(docs as never);
    }

    const newRootId = idMap.get(root._id)!.toString();

    return NextResponse.json({ rootId: newRootId, count: docs.length });
  } catch (error) {
    console.error("POST /api/tasks/duplicate error:", error);
    return NextResponse.json(
      { error: "Failed to duplicate task" },
      { status: 500 }
    );
  }
}
