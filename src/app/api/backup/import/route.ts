import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) return unauthorized();

    const body = await request.json();

    if (!body || typeof body.version !== "number") {
      return NextResponse.json(
        { error: "Invalid backup file: missing version" },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.sections) || !Array.isArray(body.tasks)) {
      return NextResponse.json(
        { error: "Invalid backup file: missing sections or tasks array" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    await Promise.all([
      db.collection("sections").deleteMany({}),
      db.collection("tasks").deleteMany({}),
    ]);

    if (body.sections.length > 0) {
      const sectionDocs = body.sections.map(
        (s: Record<string, unknown>) => {
          const { _id, ...rest } = s;
          return {
            ...rest,
            _id: ObjectId.isValid(String(_id))
              ? new ObjectId(String(_id))
              : new ObjectId(),
          };
        }
      );
      await db.collection("sections").insertMany(sectionDocs);
    }

    if (body.tasks.length > 0) {
      const taskDocs = body.tasks.map((t: Record<string, unknown>) => {
        const { _id, ...rest } = t;
        return {
          ...rest,
          _id: ObjectId.isValid(String(_id))
            ? new ObjectId(String(_id))
            : new ObjectId(),
        };
      });
      await db.collection("tasks").insertMany(taskDocs);
    }

    if (body.pagesEnvironment != null) {
      await db.collection("pages_environment").updateOne(
        { _id: "default" as unknown as import("mongodb").ObjectId },
        {
          $set: {
            environment: body.pagesEnvironment,
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: { createdAt: new Date().toISOString() },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({
      success: true,
      sections: body.sections.length,
      tasks: body.tasks.length,
    });
  } catch (error) {
    console.error("POST /api/backup/import error:", error);
    return NextResponse.json(
      { error: "Failed to import backup" },
      { status: 500 }
    );
  }
}
