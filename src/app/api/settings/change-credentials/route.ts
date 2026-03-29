import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  createSessionToken,
  getAuthState,
  getSessionFromRequest,
  getVerifiedSessionPayload,
  SESSION_COOKIE,
  unauthorized,
  isAuthDisabled,
} from "@/lib/auth";
import { isSetupComplete } from "@/lib/appConfig";
import { isLegacyPasswordLogin } from "@/lib/setupWizard";
import { getDataStore } from "@/lib/dataStore/factory";

export async function POST(request: Request) {
  if (isAuthDisabled()) {
    return NextResponse.json(
      { error: "Account settings are disabled when SKIP_AUTH is true" },
      { status: 403 }
    );
  }

  const auth = getAuthState(request);
  if (!auth.canEdit) {
    return unauthorized();
  }

  if (!isSetupComplete() || isLegacyPasswordLogin()) {
    return NextResponse.json(
      { error: "Account is managed via APP_PASSWORD; change it in your environment" },
      { status: 403 }
    );
  }

  const session = getSessionFromRequest(request);
  const claims = getVerifiedSessionPayload(session ?? undefined);
  if (!claims?.u || claims.leg) {
    return NextResponse.json(
      {
        error:
          "Your session does not include account info. Sign out and sign in again, then try once more.",
      },
      { status: 403 }
    );
  }

  let body: {
    currentPassword?: string;
    newPassword?: string;
    newUsername?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const newUsernameRaw =
    typeof body.newUsername === "string" ? body.newUsername.trim() : "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 });
  }

  const store = await getDataStore();
  const user = await store.findUserByUsername(claims.u);
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const wantsUsername =
    newUsernameRaw.length > 0 &&
    newUsernameRaw.toLowerCase() !== user.username;
  if (newPassword.length > 0 && newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (newPassword.length === 0 && !wantsUsername) {
    return NextResponse.json(
      { error: "Enter a new password (8+ characters) and/or a new username" },
      { status: 400 }
    );
  }

  let nextUsername = user.username;
  if (newUsernameRaw.length > 0) {
    const normalized = newUsernameRaw.toLowerCase();
    if (normalized !== user.username) {
      const taken = await store.findUserByUsername(normalized);
      if (taken && taken._id !== user._id) {
        return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
      }
    }
    nextUsername = newUsernameRaw.toLowerCase();
  }

  const fields: { username?: string; passwordHash?: string } = {};
  if (newUsernameRaw.length > 0) fields.username = newUsernameRaw;
  if (newPassword.length >= 8) fields.passwordHash = bcrypt.hashSync(newPassword, 10);

  try {
    await store.updateUserCredentials(user._id, fields);
  } catch (e) {
    console.error("change-credentials:", e);
    return NextResponse.json(
      { error: "Could not update account (username may be taken)" },
      { status: 400 }
    );
  }

  const token = createSessionToken({ username: nextUsername });
  const res = NextResponse.json({ ok: true, username: nextUsername });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
