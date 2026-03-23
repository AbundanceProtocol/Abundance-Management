import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { TaskItem, NewTask } from "@/lib/types";
import { ObjectId } from "mongodb";
import { getAuthState, unauthorized } from "@/lib/auth";
import { normalizeUrlsFromDoc } from "@/lib/taskUrls";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) {
      return unauthorized();
    }

    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("sectionId");

    const filter: Record<string, unknown> = {};
    if (sectionId) filter.sectionId = sectionId;

    const tasks = await db
      .collection<TaskItem>("tasks")
      .find(filter)
      .sort({ order: 1 })
      .toArray();

    return NextResponse.json(
      tasks.map((t) => {
        const plain = { ...t, _id: t._id.toString() } as TaskItem & {
          url?: string;
        };
        const urls = normalizeUrlsFromDoc(plain);
        const { url: _legacy, ...rest } = plain;
        return { ...rest, urls } as TaskItem;
      })
    );
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

    const { db } = await connectToDatabase();
    const task: NewTask = await request.json();
    const now = new Date().toISOString();

    const doc = {
      ...task,
      _id: new ObjectId(),
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("tasks").insertOne(doc);

    return NextResponse.json({ ...doc, _id: doc._id.toString() }, { status: 201 });
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

    const { db } = await connectToDatabase();
    const task: Partial<TaskItem> & { _id: string } = await request.json();
    const { _id, ...update } = task;
    const updatedAt = new Date().toISOString();
    const unsetLegacyUrl = Object.prototype.hasOwnProperty.call(update, "urls");

    await db.collection("tasks").updateOne(
      { _id: new ObjectId(_id) },
      {
        $set: { ...update, updatedAt },
        ...(unsetLegacyUrl ? { $unset: { url: "" } } : {}),
      }
    );

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

    const { db } = await connectToDatabase();
    const { id } = await request.json();

    await db.collection("tasks").deleteOne({ _id: new ObjectId(id) });
    // Also delete all children
    await db.collection("tasks").deleteMany({ parentId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
