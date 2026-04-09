import { createHmac } from "crypto";
import { redirect } from "next/navigation";
import { getAuthSecret } from "@/lib/appConfig";
import { getSessionFromRequest, getVerifiedSessionPayload, isAuthDisabled } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";
import { exchangeCodeForTokens, getGoogleCredentials } from "@/lib/googleCalendar";

/** GET — Google redirects here after the user grants access. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code) {
    redirect("/?gcal=error");
  }

  // Verify CSRF state
  const session = getSessionFromRequest(request) ?? "";
  const expectedState = createHmac("sha256", getAuthSecret()).update(session).digest("hex");
  if (!state || state !== expectedState) {
    redirect("/?gcal=error");
  }

  const creds = getGoogleCredentials();
  if (!creds) redirect("/?gcal=error");

  // Resolve the current user
  const store = await getDataStore();
  let userId: string;

  if (isAuthDisabled()) {
    // Dev mode: use a fixed sentinel userId
    userId = "dev-user";
  } else {
    const claims = getVerifiedSessionPayload(session);
    if (!claims?.u) redirect("/?gcal=error");
    const user = await store.findUserByUsername(claims.u);
    if (!user) redirect("/?gcal=error");
    userId = user._id;
  }

  try {
    const tokens = await exchangeCodeForTokens(code!, creds.clientId, creds.clientSecret);
    await store.saveGoogleOAuthToken({
      userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      calendarId: "primary",
      connectedAt: new Date().toISOString(),
    });
  } catch {
    redirect("/?gcal=error");
  }

  redirect("/?gcal=connected");
}
