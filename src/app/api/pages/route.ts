import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import { getAuthState, unauthorized } from "@/lib/auth";
import type { PagesEnvironment } from "@/lib/pagesTypes";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) return unauthorized();

    const store = await getDataStore();
    const environment = await store.getPagesEnvironment();
    return NextResponse.json(environment);
  } catch (error) {
    console.error("GET /api/pages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pages environment" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) return unauthorized();

    const store = await getDataStore();
    const environment = (await request.json()) as PagesEnvironment;
    await store.setPagesEnvironment(environment);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/pages error:", error);
    return NextResponse.json(
      { error: "Failed to update pages environment" },
      { status: 500 }
    );
  }
}