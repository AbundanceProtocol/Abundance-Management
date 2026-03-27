import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) return unauthorized();

    const { db } = await connectToDatabase();

    const [sections, tasks, pagesDoc] = await Promise.all([
      db.collection("sections").find().sort({ order: 1 }).toArray(),
      db.collection("tasks").find().sort({ order: 1 }).toArray(),
      db.collection("pages_environment").findOne({ _id: "default" as unknown as import("mongodb").ObjectId }),
    ]);

    const stringify = (doc: Record<string, unknown>) => {
      const { _id, ...rest } = doc;
      return { ...rest, _id: String(_id) };
    };

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sections: sections.map((s) => stringify(s as Record<string, unknown>)),
      tasks: tasks.map((t) => stringify(t as Record<string, unknown>)),
      pagesEnvironment: pagesDoc
        ? (pagesDoc as Record<string, unknown>).environment ?? null
        : null,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/backup/export error:", error);
    return NextResponse.json(
      { error: "Failed to export backup" },
      { status: 500 }
    );
  }
}
