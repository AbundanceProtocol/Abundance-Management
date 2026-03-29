import { NextResponse } from "next/server";
import { getAuthState, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";

const CONFIRM_PHRASE = "RESET_APPLICATION_DATA";

export async function POST(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) {
    return unauthorized();
  }

  let body: { confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Type "${CONFIRM_PHRASE}" in the confirm field` },
      { status: 400 }
    );
  }

  try {
    const store = await getDataStore();
    await store.resetApplicationData();
  } catch (e) {
    console.error("reset-application-data:", e);
    return NextResponse.json({ error: "Failed to reset data" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
