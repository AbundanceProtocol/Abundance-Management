import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) return unauthorized();

    const store = await getDataStore();
    const payload = await store.backupExport();

    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/backup/export error:", error);
    return NextResponse.json(
      { error: "Failed to export backup" },
      { status: 500 }
    );
  }
}