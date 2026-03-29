import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  createSessionToken,
  verifyPassword,
  SESSION_COOKIE,
  isAuthDisabled,
} from "@/lib/auth";
import { getAuthSecret, isSetupComplete } from "@/lib/appConfig";
import { isLegacyPasswordLogin } from "@/lib/setupWizard";
import { getDataStore } from "@/lib/dataStore/factory";

export async function POST(request: Request) {
  if (isAuthDisabled()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const secret = getAuthSecret().trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Server missing auth secret (AUTH_SECRET or app config)" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));

  if (isLegacyPasswordLogin()) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }
  } else if (isSetupComplete()) {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      );
    }
    const store = await getDataStore();
    const user = await store.findUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
  } else {
    return NextResponse.json(
      { error: "Complete initial setup before signing in" },
      { status: 403 }
    );
  }

  const token = isLegacyPasswordLogin()
    ? createSessionToken({ legacy: true })
    : createSessionToken({
        username:
          typeof body.username === "string" ? body.username : "",
      });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}