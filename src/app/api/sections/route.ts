import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Section } from "@/lib/types";
import { ObjectId } from "mongodb";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) {
      return unauthorized();
    }

    const { db } = await connectToDatabase();
    const sections = await db
      .collection<Section>("sections")
      .find()
      .sort({ order: 1 })
      .toArray();

    if (sections.length === 0 && auth.canEdit) {
      const defaults: Omit<Section, "_id">[] = [
        {
          title: "Product Launch",
          type: "project",
          order: 0,
          collapsed: false,
          isSequential: false,
          topLevelSort: "manual",
          groupByCategory: false,
        },
        {
          title: "Recurring",
          type: "recurring",
          order: 1,
          collapsed: false,
          isSequential: false,
          topLevelSort: "manual",
          groupByCategory: false,
        },
        {
          title: "To Do List",
          type: "todo",
          order: 2,
          collapsed: false,
          isSequential: false,
          topLevelSort: "manual",
          groupByCategory: false,
        },
      ];
      const result = await db.collection("sections").insertMany(
        defaults.map((s) => ({ ...s, _id: new ObjectId() }))
      );
      const inserted = defaults.map((s, i) => ({
        ...s,
        _id: Object.values(result.insertedIds)[i].toString(),
      }));
      return NextResponse.json(inserted);
    }

    return NextResponse.json(
      sections.map((s) => ({
        ...s,
        _id: s._id.toString(),
        isSequential: s.isSequential ?? false,
        topLevelSort:
          (s as { topLevelSort?: string }).topLevelSort === "category"
            ? "manual"
            : (s.topLevelSort ?? "manual"),
        groupByCategory: s.groupByCategory ?? false,
      }))
    );
  } catch (error) {
    console.error("GET /api/sections error:", error);
    return NextResponse.json({ error: "Failed to fetch sections" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) {
      return unauthorized();
    }

    const { db } = await connectToDatabase();
    const section: Partial<Section> & { _id: string } = await request.json();
    const { _id, ...update } = section;

    await db
      .collection("sections")
      .updateOne({ _id: new ObjectId(_id) }, { $set: update });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/sections error:", error);
    return NextResponse.json({ error: "Failed to update section" }, { status: 500 });
  }
}
