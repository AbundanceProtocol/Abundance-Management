import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
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

    const store = await getDataStore();
    await store.backupImport({
      version: body.version,
      sections: body.sections,
      tasks: body.tasks,
      pagesEnvironment: body.pagesEnvironment,
    });

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