import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import { getAuthState, unauthorized } from "@/lib/auth";
import type { MindMapsEnvironment } from "@/lib/mindMapTypes";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) return unauthorized();

    const store = await getDataStore();
    const environment = await store.getMindMapsEnvironment();
    return NextResponse.json(environment);
  } catch (error) {
    console.error("GET /api/mind-maps error:", error);
    return NextResponse.json(
      { error: "Failed to fetch mind maps environment" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) return unauthorized();

    const store = await getDataStore();
    const environment = (await request.json()) as MindMapsEnvironment;
    await store.setMindMapsEnvironment(environment);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/mind-maps error:", error);
    return NextResponse.json(
      { error: "Failed to update mind maps environment" },
      { status: 500 }
    );
  }
}
