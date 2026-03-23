import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "ab_session";

/** Local dev only: bypass login and API auth when set to "true". */
export function isAuthDisabled(): boolean {
  return process.env.SKIP_AUTH === "true";
}

function getSecret(): string {
  return process.env.AUTH_SECRET ?? "";
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ exp });
  const sig = signPayload(payload);
  return Buffer.from(JSON.stringify({ p: payload, s: sig }), "utf8").toString(
    "base64url"
  );
}

export function verifySessionToken(value: string | undefined): boolean {
  if (!value || !getSecret()) return false;
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const { p, s } = JSON.parse(raw) as { p: string; s: string };
    const expected = signPayload(p);
    if (expected.length !== s.length) return false;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return false;
    const { exp } = JSON.parse(p) as { exp: number };
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
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
