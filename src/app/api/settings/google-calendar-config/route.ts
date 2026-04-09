import { NextResponse } from "next/server";
import { getAuthState, unauthorized } from "@/lib/auth";
import { readAppConfig, writeAppConfig } from "@/lib/appConfig";

/** GET — returns whether Google OAuth credentials are configured (no secrets exposed). */
export async function GET(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canRead) return unauthorized();

  const cfg = readAppConfig();
  return NextResponse.json({
    configured: Boolean(cfg?.googleClientId?.trim() && cfg?.googleClientSecret?.trim()),
  });
}

/** POST — save Google OAuth client credentials to app-config.json. */
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

  const existing = readAppConfig() ?? {};
  writeAppConfig({ ...existing, googleClientId: clientId, googleClientSecret: clientSecret });

  return NextResponse.json({ success: true });
}
