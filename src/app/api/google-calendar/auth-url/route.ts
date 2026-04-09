import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getAuthState, getSessionFromRequest, unauthorized } from "@/lib/auth";
import { getAuthSecret } from "@/lib/appConfig";
import { getAuthUrl, getGoogleCredentials } from "@/lib/googleCalendar";

/** GET — generate and return the Google OAuth authorization URL. */
export async function GET(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();

  const creds = getGoogleCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "Google Calendar credentials are not configured." },
      { status: 400 }
    );
  }

  // CSRF state = HMAC of the session cookie value
  const session = getSessionFromRequest(request) ?? "";
  const state = createHmac("sha256", getAuthSecret()).update(session).digest("hex");

  const url = getAuthUrl(creds.clientId, creds.clientSecret, state);
  return NextResponse.json({ url });
}
