import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret as readAuthSecret } from "@/lib/appConfig";

export const SESSION_COOKIE = "ab_session";

/** Local dev only: bypass login and API auth when set to "true". */
export function isAuthDisabled(): boolean {
  return process.env.SKIP_AUTH === "true";
}

function getSecret(): string {
  return readAuthSecret();
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export type SessionPayload = {
  exp: number;
  /** Logged-in username (lowercase) when using database accounts. */
  u?: string;
  /** True when signed in with APP_PASSWORD (legacy). */
  leg?: boolean;
};

export function createSessionToken(opts?: {
  username?: string;
  legacy?: boolean;
}): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const body: SessionPayload = { exp };
  if (opts?.legacy) body.leg = true;
  else if (opts?.username?.trim()) body.u = opts.username.trim().toLowerCase();
  const payload = JSON.stringify(body);
  const sig = signPayload(payload);
  return Buffer.from(JSON.stringify({ p: payload, s: sig }), "utf8").toString(
    "base64url"
  );
}

/** Returns parsed session claims if the cookie is valid and not expired. */
export function getVerifiedSessionPayload(
  value: string | undefined
): SessionPayload | null {
  if (!value || !getSecret()) return null;
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const { p, s } = JSON.parse(raw) as { p: string; s: string };
    const expected = signPayload(p);
    if (expected.length !== s.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
    const payload = JSON.parse(p) as SessionPayload;
    if (typeof payload.exp !== "number" || Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifySessionToken(value: string | undefined): boolean {
  return getVerifiedSessionPayload(value) != null;
}

export function parseCookieHeader(
  header: string | null,
  name: string
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function getSessionFromRequest(request: Request): string | null {
  return parseCookieHeader(request.headers.get("cookie"), SESSION_COOKIE);
}

export type AuthState = { canRead: boolean; canEdit: boolean };

export function getAuthState(request: Request): AuthState {
  if (isAuthDisabled()) {
    return { canRead: true, canEdit: true };
  }

  const secret = getSecret();
  if (!secret) {
    return { canRead: false, canEdit: false };
  }

  const session = getSessionFromRequest(request);
  const edit = verifySessionToken(session ?? undefined);

  return {
    canRead: edit,
    canEdit: edit,
  };
}

export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  try {
    const a = Buffer.from(password, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}