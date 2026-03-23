import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getAuthState, unauthorized } from "@/lib/auth";

interface ReorderItem {
  _id: string;
  order: number;
  parentId: string | null;
  depth: number;
  sectionId: string;
}

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) {
      return unauthorized();
    }

    const { db } = await connectToDatabase();
    const items: ReorderItem[] = await request.json();

    const ops = items.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item._id) },
        update: {
          $set: {
            order: item.order,
            parentId: item.parentId,
            depth: item.depth,
            sectionId: item.sectionId,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    }));

    if (ops.length > 0) {
      await db.collection("tasks").bulkWrite(ops);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/tasks/reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder tasks" }, { status: 500 });
  }
}
