export type TimeUnit = "minutes" | "hours" | "days";

export type TaskPriority = "low" | "medium" | "high";

/** How top-level tasks (parentId null) are ordered within a section. Nested tasks always follow manual `order`. */
export type TopLevelSort = "manual" | "priority" | "startDate";

export type SectionType = "project" | "recurring" | "todo";

/** `none` = one-off task; recurring section tasks can use daily/weekly/monthly. */
export type RepeatFrequency = "none" | "daily" | "weekly" | "monthly";

export interface TaskItem {
  _id: string;
  sectionId: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  depth: number; // 0 = top-level row; see MAX_TASK_DEPTH in constants.ts
  order: number;
  /** Defaults to medium when missing (older tasks). */
  priority?: TaskPriority;
  timeEstimate: number | null;
  timeUnit: TimeUnit;
  notes: string;
  /** External links (trimmed non-empty strings in UI). */
  urls: string[];
  startDate: string | null;
  dueDate: string | null;
  /** `HH:mm` local — todo: due time (with due date); recurring: scheduled time (optional without due date). */
  dueTime?: string | null;
  isCriticalPath: boolean;
  isSequential: boolean;
  collapsed: boolean;
  tags: string[];
  /** When set and not `none`, completing the task logs a date and advances `dueDate`. */
  repeatFrequency?: RepeatFrequency;
  /** 0–6 Sun–Sat; used when `repeatFrequency` is `weekly`. */
  repeatWeekdays?: number[];
  /** YYYY-MM-DD entries when a recurring instance was completed. */
  completionHistory?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  _id: string;
  title: string;
  type: SectionType;
  order: number;
  collapsed: boolean;
  /** When true, top-level tasks in this section are shown/treated as a sequential list (order matters). */
  isSequential: boolean;
  /** Sort order for top-level tasks only; nested tasks use drag `order`. */
  topLevelSort?: TopLevelSort;
}

export type NewTask = Omit<TaskItem, "_id" | "createdAt" | "updatedAt">;
