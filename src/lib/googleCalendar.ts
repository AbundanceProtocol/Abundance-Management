/**
 * Server-side Google Calendar integration helpers.
 * All functions run only in API routes — never imported client-side.
 */

import { google } from "googleapis";
import type { AppDataStore, GoogleOAuthToken } from "@/lib/dataStore/types";
import type { TaskItem } from "@/lib/types";
import { readAppConfig } from "@/lib/appConfig";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

/** The redirect URI sent during OAuth. Must match what's registered in Google Cloud Console. */
export function getRedirectUri(): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/api/google-calendar/callback`;
}

function makeOAuth2Client(clientId: string, clientSecret: string) {
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

// ─── Credential helpers ───────────────────────────────────────────────────────

export function getGoogleCredentials(): { clientId: string; clientSecret: string } | null {
  const cfg = readAppConfig();
  const clientId = cfg?.googleClientId?.trim();
  const clientSecret = cfg?.googleClientSecret?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// ─── OAuth URL generation ─────────────────────────────────────────────────────

export function getAuthUrl(clientId: string, clientSecret: string, state: string): string {
  const oauth2 = makeOAuth2Client(clientId, clientSecret);
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
}

// ─── Code exchange ────────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const oauth2 = makeOAuth2Client(clientId, clientSecret);
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google did not return the expected tokens. Try connecting again.");
  }
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  };
}

// ─── Authenticated client (with auto-refresh + persist) ───────────────────────

async function getAuthedClient(
  storedToken: GoogleOAuthToken,
  store: AppDataStore
) {
  const creds = getGoogleCredentials();
  if (!creds) throw new Error("Google credentials not configured.");

  const oauth2 = makeOAuth2Client(creds.clientId, creds.clientSecret);
  oauth2.setCredentials({
    access_token: storedToken.accessToken,
    refresh_token: storedToken.refreshToken,
    expiry_date: storedToken.expiresAt ? new Date(storedToken.expiresAt).getTime() : undefined,
  });

  // Persist refreshed tokens back to the store
  oauth2.on("tokens", async (newTokens) => {
    const updated: GoogleOAuthToken = {
      ...storedToken,
      accessToken: newTokens.access_token ?? storedToken.accessToken,
      expiresAt: newTokens.expiry_date
        ? new Date(newTokens.expiry_date).toISOString()
        : storedToken.expiresAt,
    };
    await store.saveGoogleOAuthToken(updated).catch(() => {});
  });

  return oauth2;
}

// ─── Task → Calendar event mapping ───────────────────────────────────────────

const PRIORITY_COLOR_ID: Record<string, string> = {
  high: "11",    // Tomato
  medium: "5",   // Banana
  low: "2",      // Sage
};

type CalendarEvent = {
  summary: string;
  description?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  colorId?: string;
};

function taskToEvent(task: TaskItem): CalendarEvent {
  const summary = task.title?.trim() || "Untitled task";
  const description = task.notes?.trim() || undefined;
  const colorId = task.priority ? (PRIORITY_COLOR_ID[task.priority] ?? undefined) : undefined;

  const startDate = task.startDate || task.dueDate!;
  const endDate = task.dueDate!;

  if (task.dueTime) {
    // Timed event — use dateTime
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startDt = `${startDate}T${task.dueTime}:00`;
    const endDt = `${endDate}T${task.dueTime}:00`;
    return {
      summary,
      ...(description ? { description } : {}),
      start: { dateTime: startDt, timeZone: tz },
      end: { dateTime: endDt, timeZone: tz },
      ...(colorId ? { colorId } : {}),
    };
  }

  // All-day event
  return {
    summary,
    ...(description ? { description } : {}),
    start: { date: startDate },
    end: { date: endDate },
    ...(colorId ? { colorId } : {}),
  };
}

// ─── Push a task to Google Calendar (create or update) ───────────────────────

export async function pushTaskToCalendar(
  task: TaskItem,
  storedToken: GoogleOAuthToken,
  store: AppDataStore
): Promise<string> {
  const auth = await getAuthedClient(storedToken, store);
  const cal = google.calendar({ version: "v3", auth });
  const calendarId = storedToken.calendarId || "primary";
  const eventBody = taskToEvent(task);

  if (task.googleCalendarEventId) {
    // Update existing event — fall back to create if 404
    try {
      const res = await cal.events.update({
        calendarId,
        eventId: task.googleCalendarEventId,
        requestBody: eventBody,
      });
      return res.data.id!;
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      if (status !== 404) throw err;
      // Event was deleted externally — fall through to create
    }
  }

  const res = await cal.events.insert({
    calendarId,
    requestBody: eventBody,
  });
  return res.data.id!;
}

// ─── Delete a calendar event ──────────────────────────────────────────────────

export async function deleteCalendarEvent(
  eventId: string,
  storedToken: GoogleOAuthToken,
  store: AppDataStore
): Promise<void> {
  const auth = await getAuthedClient(storedToken, store);
  const cal = google.calendar({ version: "v3", auth });
  const calendarId = storedToken.calendarId || "primary";
  try {
    await cal.events.delete({ calendarId, eventId });
  } catch (err: unknown) {
    // 404 = already gone — not an error
    if ((err as { code?: number })?.code !== 404) throw err;
  }
}
