import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { getDataStore } from "@/lib/dataStore/factory";
import { getAuthState, unauthorized } from "@/lib/auth";
import type { ViewToken } from "@/lib/types";

export async function GET(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canRead) return unauthorized();
  try {
    const store = await getDataStore();
    const tokens = await store.getViewTokens();
    return NextResponse.json(tokens);
  } catch (e) {
    console.error("GET /api/view-tokens error:", e);
    return NextResponse.json({ error: "Failed to fetch view tokens" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();
  try {
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const vt: ViewToken = {
      _id: randomUUID(),
      name: name.trim(),
      token: randomBytes(24).toString("base64url"),
      createdAt: new Date().toISOString(),
    };
    const store = await getDataStore();
    await store.createViewToken(vt);
    return NextResponse.json(vt);
  } catch (e) {
    console.error("POST /api/view-tokens error:", e);
    return NextResponse.json({ error: "Failed to create view token" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const store = await getDataStore();
    await store.deleteViewToken(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/view-tokens error:", e);
    return NextResponse.json({ error: "Failed to delete view token" }, { status: 500 });
  }
}
