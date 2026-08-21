import { createHmac } from "crypto";
import { redirect } from "next/navigation";
import { getAuthSecret } from "@/lib/appConfig";
import { getSessionFromRequest, getVerifiedSessionPayload, isAuthDisabled } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";
import { exchangeCodeForTokens, getGoogleCredentials } from "@/lib/googleCalendar";

/**
 * Redirects home with a short, non-sensitive `reason` code so the UI (and whoever's
 * debugging) can tell which check failed, instead of a silent generic `?gcal=error`.
 * Full error detail (which may include internal messages) is only logged server-side.
 */
function failWith(reason: string, detail?: unknown): never {
  if (detail !== undefined) {
    console.error(`[google-calendar/callback] ${reason}:`, detail);
  } else {
    console.error(`[google-calendar/callback] ${reason}`);
  }
  redirect(`/?gcal=error&reason=${encodeURIComponent(reason)}`);
}

/** GET — Google redirects here after the user grants access. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const googleError = searchParams.get("error");

  if (googleError) failWith(`google_${googleError}`);
  if (!code) failWith("no_code");

  // Verify CSRF state
  const session = getSessionFromRequest(request) ?? "";
  const expectedState = createHmac("sha256", getAuthSecret()).update(session).digest("hex");
  if (!state || state !== expectedState) {
    failWith("csrf_mismatch");
  }

  let store;
  try {
    store = await getDataStore();
  } catch (e) {
    failWith("datastore_error", e instanceof Error ? e.message : e);
  }

  const creds = await getGoogleCredentials(store);
  if (!creds) failWith("no_credentials");

  // Resolve the current user
  let userId: string;

  if (isAuthDisabled()) {
    // Dev mode: use a fixed sentinel userId
    userId = "dev-user";
  } else {
    const claims = getVerifiedSessionPayload(session);
    if (!claims?.u) failWith("no_session");
    const user = await store.findUserByUsername(claims.u);
    if (!user) failWith("no_user");
    userId = user._id;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, creds.clientId, creds.clientSecret);
    await store.saveGoogleOAuthToken({
      userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      calendarId: "primary",
      connectedAt: new Date().toISOString(),
    });
  } catch (e) {
    failWith("token_exchange_failed", e instanceof Error ? e.message : e);
  }

  redirect("/?gcal=connected");
}
