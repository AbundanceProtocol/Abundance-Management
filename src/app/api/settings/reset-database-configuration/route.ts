import { NextResponse } from "next/server";
import {
  getAuthState,
  SESSION_COOKIE,
  unauthorized,
  isAuthDisabled,
} from "@/lib/auth";
import { readAppConfig, writeAppConfig, isSetupComplete } from "@/lib/appConfig";
import { invalidateDataStoreCache } from "@/lib/dataStore/factory";
import { disconnectMongoStore } from "@/lib/dataStore/mongoStore";

const CONFIRM_PHRASE = "RESET_DATABASE_CONFIGURATION";

/**
 * Clears stored DB engine/connection and setup flag so the user can run /setup again.
 * Preserves auth secret (from config file or AUTH_SECRET env) so sessions and the wizard still work.
 */
export async function POST(request: Request) {
  if (isAuthDisabled()) {
    return NextResponse.json(
      { error: "Not available when SKIP_AUTH is true" },
      { status: 403 }
    );
  }

  const auth = getAuthState(request);
  if (!auth.canEdit) {
    return unauthorized();
  }

  if (!isSetupComplete()) {
    return NextResponse.json(
      { error: "Database setup is not complete; use /setup instead" },
      { status: 403 }
    );
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

  const cfg = readAppConfig();
  const secret =
    cfg?.authSecret?.trim() || process.env.AUTH_SECRET?.trim() || "";
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "No auth secret found in app config or AUTH_SECRET env. Set AUTH_SECRET, restart, then try again.",
      },
      { status: 400 }
    );
  }

  await disconnectMongoStore();
  invalidateDataStoreCache();
  writeAppConfig({ authSecret: secret });

  const res = NextResponse.json({ ok: true, redirect: "/setup" });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
