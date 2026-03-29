import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/dataStore/factory";
import type { Section } from "@/lib/types";
import { getAuthState, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) {
      return unauthorized();
    }

    const store = await getDataStore();
    const sections = await store.getSections({ ensureDefaultsIfEmpty: auth.canEdit });

    return NextResponse.json(sections);
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

    const store = await getDataStore();
    const section: Partial<Section> & { _id: string } = await request.json();
    const { _id, ...update } = section;

    await store.updateSection(_id, update);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/sections error:", error);
    return NextResponse.json({ error: "Failed to update section" }, { status: 500 });
  }
}