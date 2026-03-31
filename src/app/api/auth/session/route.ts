import { NextResponse } from "next/server";
import {
  getAuthState,
  getSessionFromRequest,
  getVerifiedSessionPayload,
  isAuthDisabled,
} from "@/lib/auth";
import { isSetupComplete } from "@/lib/appConfig";
import { isLegacyPasswordLogin } from "@/lib/setupWizard";

export async function GET(request: Request) {
  const { canRead, canEdit } = getAuthState(request);
  const session = getSessionFromRequest(request);
  const claims = getVerifiedSessionPayload(session ?? undefined);
  const skipAuth = isAuthDisabled();
  const legacyMode = !skipAuth && isLegacyPasswordLogin();
  const setupDone = isSetupComplete();
  const hasUserClaim = Boolean(claims?.u);
  const legacyClaim = claims?.leg === true;

  return NextResponse.json({
    authenticated: canEdit,
    canRead,
    canEdit,
    account: {
      skipAuth,
      legacyMode,
      username: claims?.u ?? null,
      canChangeCredentials:
        canEdit &&
        setupDone &&
        !legacyMode &&
        !skipAuth &&
        hasUserClaim &&
        !legacyClaim,
      needsReauthForCredentials:
        canEdit &&
        setupDone &&
        !legacyMode &&
        !skipAuth &&
        !hasUserClaim &&
        !legacyClaim,
      /** True when app-config has completed DB setup (Mongo/Postgres/SQLite + admin). */
      databaseSetupComplete: setupDone,
    },
  });
}
