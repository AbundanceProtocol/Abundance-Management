import { NextResponse } from "next/server";
import { getAuthState, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";

/** GET — returns whether Google OAuth credentials are configured (no secrets exposed). */
export async function GET(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canRead) return unauthorized();

  const store = await getDataStore();
  const creds = await store.getGoogleClientCredentials();
  return NextResponse.json({ configured: Boolean(creds) });
}

/** POST — save Google OAuth client credentials to the database. */
export async function POST(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();

  const body = (await request.json()) as {
    googleClientId?: unknown;
    googleClientSecret?: unknown;
  };

  const clientId = typeof body.googleClientId === "string" ? body.googleClientId.trim() : "";
  const clientSecret =
    typeof body.googleClientSecret === "string" ? body.googleClientSecret.trim() : "";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Both Client ID and Client Secret are required." },
      { status: 400 }
    );
  }

  try {
    const store = await getDataStore();
    await store.saveGoogleClientCredentials({ clientId, clientSecret });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save credentials";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
