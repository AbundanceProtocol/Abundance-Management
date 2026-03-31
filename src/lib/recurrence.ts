import type { TaskItem } from "./types";

const MS_DAY = 86_400_000;

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** Next calendar day strictly after `from` (date-only). */
export function computeNextDueDate(task: TaskItem, from: Date = new Date()): string {
  const freq = task.repeatFrequency ?? "none";
  const anchor = task.dueDate?.trim()
    ? parseYmd(task.dueDate)
    : new Date(from.getFullYear(), from.getMonth(), from.getDate());

  if (freq === "daily") {
    const start = parseYmd(formatYmd(from));
    return formatYmd(addDays(start, 1));
  }

  if (freq === "weekly") {
    const days =
      task.repeatWeekdays && task.repeatWeekdays.length > 0
        ? [...new Set(task.repeatWeekdays)].sort((a, b) => a - b)
        : [anchor.getDay()];
    const fromDay = parseYmd(formatYmd(from));
    for (let i = 1; i <= 370; i++) {
      const cand = addDays(fromDay, i);
      if (days.includes(cand.getDay())) {
        return formatYmd(cand);
      }
    }
    return formatYmd(addDays(fromDay, 7));
  }

  if (freq === "monthly") {
    const dayOfMonth = anchor.getDate();
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const y = fromDay.getFullYear();
    const m = fromDay.getMonth();
    const dim = daysInMonth(y, m);
    const thisMonth = new Date(y, m, Math.min(dayOfMonth, dim));
    if (thisMonth.getTime() > fromDay.getTime()) {
      return formatYmd(thisMonth);
    }
    let nm = m + 1;
    let ny = y;
    if (nm > 11) {
      nm = 0;
      ny++;
    }
    const dim2 = daysInMonth(ny, nm);
    return formatYmd(new Date(ny, nm, Math.min(dayOfMonth, dim2)));
  }

  return formatYmd(addDays(parseYmd(formatYmd(from)), 1));
}

export function isRecurringCompletionActive(
  task: TaskItem,
  now: Date = new Date()
): boolean {
  const iso = task.recurringCompletionUntilIso;
  if (!iso?.trim()) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return now.getTime() < ms;
}

function daysInMonth(year: number, monthZeroIndexed: number): number {
  return new Date(year, monthZeroIndexed + 1, 0).getDate();
}

/**
 * Hide completed tasks and entire subtrees rooted at a completed task.
 * Preserves sibling order among remaining tasks.
 */
export function filterTasksForMainView(
  tasks: TaskItem[],
  showCompleted: boolean
): TaskItem[] {
  const visible = tasks.filter((t) => !t.mindMapOnly);
  if (showCompleted) return visible;
  const byParent = new Map<string | null, TaskItem[]>();
  for (const t of visible) {
    const pid = t.parentId;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(t);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
  }
  const out: TaskItem[] = [];
  function walk(pid: string | null) {
    for (const t of byParent.get(pid) ?? []) {
      if (t.completed) continue;
      out.push(t);
      walk(t._id);
    }
  }
  walk(null);
  return out;
}

export type DueBucket = "overdue" | "today" | "soon";

/** Local instant for due date + optional time; date-only uses end of that calendar day. */
export function parseDueDateTimeLocal(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined
): Date | null {
  if (!dueDate?.trim()) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (dueTime?.trim()) {
    const parts = dueTime.trim().split(":");
    const hh = parseInt(parts[0] ?? "", 10);
    const mm = parseInt(parts[1] ?? "", 10);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return new Date(y, m - 1, d, hh, mm, 0, 0);
    }
  }
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function formatDueTimeDisplay(dueTime: string | null | undefined): string {
  if (!dueTime?.trim()) return "";
  const parts = dueTime.trim().split(":");
  const h = parseInt(parts[0] ?? "", 10);
  const min = parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return dueTime.trim();
  const d = new Date(2000, 0, 1, h, min, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Clamp to 1–10; default 5 for missing or invalid values. */
export function normalizeTaskWeight(w: number | null | undefined): number {
  if (w == null || !Number.isFinite(w)) return 5;
  return Math.min(10, Math.max(1, Math.round(w)));
}

/** Sum of weights for applicable habits on `dayYmd`, and sum of those weights for habits completed that day. */
export function weightedRecurringDayAssignedAndCompleted(
  sectionTasks: TaskItem[],
  dayYmd: string
): { assigned: number; completed: number } {
  let assigned = 0;
  let completed = 0;
  for (const t of sectionTasks) {
    const freq = t.repeatFrequency ?? "none";
    if (freq === "none") continue;
    const sd = t.startDate?.trim();
    if (!sd) continue;
    if (sd > dayYmd) continue;
    const tw = normalizeTaskWeight(t.taskWeight);
    assigned += tw;
    if ((t.completionHistory ?? []).includes(dayYmd)) completed += tw;
  }
  return { assigned, completed };
}

/**
 * Weighted completion for one calendar day: sum(completed weights) / sum(applicable weights).
 * Only tasks with a start date on or before `dayYmd` are included; tasks without a start date are excluded.
 * Returns null if no recurring habit applies to that day.
 */
export function weightedRecurringDayCompletionPercent(
  sectionTasks: TaskItem[],
  dayYmd: string
): number | null {
  const { assigned, completed } = weightedRecurringDayAssignedAndCompleted(
    sectionTasks,
    dayYmd
  );
  if (assigned === 0) return null;
  return (completed / assigned) * 100;
}

/** Add `delta` calendar days to a YYYY-MM-DD string (local date). */
export function addCalendarDaysYmd(dayYmd: string, delta: number): string {
  const [y, m, d] = dayYmd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return formatYmd(dt);
}

export function dueBucketForTask(task: TaskItem, now: Date = new Date()): DueBucket | null {
  if (!task.dueDate?.trim() || task.completed) return null;
  if (isRecurringCompletionActive(task, now)) return null;
  const dueAt = parseDueDateTimeLocal(task.dueDate, task.dueTime);
  if (!dueAt) return null;
  if (dueAt.getTime() < now.getTime()) {
    return "overdue";
  }
  const startOfToday = startOfLocalDay(now);
  const dueDayStart = startOfLocalDay(dueAt);
  const diffDays = (dueDayStart.getTime() - startOfToday.getTime()) / MS_DAY;
  if (diffDays === 0) return "today";
  if (diffDays >= 1 && diffDays <= 7) return "soon";
  return null;
}
