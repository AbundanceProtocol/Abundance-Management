import type { TaskItem } from "./types";
import {
  addCalendarDaysYmd,
  formatYmd,
  weightedRecurringDayAssignedAndCompleted,
} from "./recurrence";

export type RecurringChartGranularity = "daily" | "monthly" | "yearly" | "all";

export interface RecurringChartBucket {
  label: string;
  /** Sortable key for ordering (YYYY-MM-DD or YYYY-MM or YYYY). */
  sortKey: string;
  assigned: number;
  completed: number;
}

function daysInMonth(year: number, monthZero: number): number {
  return new Date(year, monthZero + 1, 0).getDate();
}

function earliestStatsYmd(tasks: TaskItem[]): string | null {
  let min: string | null = null;
  for (const t of tasks) {
    const freq = t.repeatFrequency ?? "none";
    if (freq === "none") continue;
    const sd = t.startDate?.trim();
    if (sd) {
      if (min === null || sd < min) min = sd;
    }
    for (const h of t.completionHistory ?? []) {
      const hx = h.trim();
      if (!hx) continue;
      if (min === null || hx < min) min = hx;
    }
  }
  return min;
}

/**
 * Build chart buckets: same per-day rules as the calendar (start date required; weight sums).
 */
export function buildRecurringChartSeries(
  tasks: TaskItem[],
  granularity: RecurringChartGranularity,
  now: Date = new Date()
): RecurringChartBucket[] {
  const todayYmd = formatYmd(now);
  const [ty, tm] = todayYmd.split("-").map(Number);

  if (granularity === "daily") {
    const n = 30;
    const out: RecurringChartBucket[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const ymd = addCalendarDaysYmd(todayYmd, -i);
      const { assigned, completed } = weightedRecurringDayAssignedAndCompleted(
        tasks,
        ymd
      );
      const d = new Date(
        Number(ymd.slice(0, 4)),
        Number(ymd.slice(5, 7)) - 1,
        Number(ymd.slice(8, 10))
      );
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      out.push({ label, sortKey: ymd, assigned, completed });
    }
    return out;
  }

  if (granularity === "monthly") {
    const out: RecurringChartBucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ty, tm - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const dim = daysInMonth(y, m);
      let assigned = 0;
      let completed = 0;
      for (let day = 1; day <= dim; day++) {
        const ymd = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (ymd > todayYmd) break;
        const dayStats = weightedRecurringDayAssignedAndCompleted(tasks, ymd);
        assigned += dayStats.assigned;
        completed += dayStats.completed;
      }
      const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const sortKey = `${y}-${String(m + 1).padStart(2, "0")}`;
      out.push({ label, sortKey, assigned, completed });
    }
    return out;
  }

  if (granularity === "yearly") {
    const out: RecurringChartBucket[] = [];
    for (let i = 4; i >= 0; i--) {
      const year = ty - i;
      let assigned = 0;
      let completed = 0;
      for (let m = 0; m < 12; m++) {
        const dim = daysInMonth(year, m);
        for (let day = 1; day <= dim; day++) {
          const ymd = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (ymd > todayYmd) break;
          const dayStats = weightedRecurringDayAssignedAndCompleted(tasks, ymd);
          assigned += dayStats.assigned;
          completed += dayStats.completed;
        }
      }
      out.push({
        label: String(year),
        sortKey: String(year),
        assigned,
        completed,
      });
    }
    return out;
  }

  // all
  const start = earliestStatsYmd(tasks);
  if (!start || start > todayYmd) {
    return [
      {
        label: "All time",
        sortKey: "all",
        assigned: 0,
        completed: 0,
      },
    ];
  }
  let assigned = 0;
  let completed = 0;
  let cursor = start;
  while (cursor <= todayYmd) {
    const dayStats = weightedRecurringDayAssignedAndCompleted(tasks, cursor);
    assigned += dayStats.assigned;
    completed += dayStats.completed;
    cursor = addCalendarDaysYmd(cursor, 1);
  }
  return [
    {
      label: "All time",
      sortKey: "all",
      assigned,
      completed,
    },
  ];
}
