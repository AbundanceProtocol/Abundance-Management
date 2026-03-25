export const TODAY_FOCUS_RESET_HOUR = 2; // local time

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Returns the active "today focus" YMD for local time, with the reset at 2:00am.
 * Example: at 01:00, the active focus period is the previous calendar day.
 */
export function getActiveTodayFocusYmd(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < TODAY_FOCUS_RESET_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return formatYmdLocal(d);
}

/**
 * Milliseconds until the next local 2:00am reset.
 */
export function msUntilNextTodayFocusReset(now: Date = new Date()): number {
  const d = new Date(now);
  const next = new Date(d);
  next.setHours(TODAY_FOCUS_RESET_HOUR, 0, 0, 0);
  if (next.getTime() <= d.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - d.getTime();
}

