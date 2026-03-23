import { NextResponse } from "next/server";
import {
  createSessionToken,
  verifyPassword,
  SESSION_COOKIE,
  isAuthDisabled,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (isAuthDisabled()) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (!process.env.AUTH_SECRET?.trim()) {
    return NextResponse.json(
      { error: "Server missing AUTH_SECRET" },
      { status: 500 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const token = createSessionToken();
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
