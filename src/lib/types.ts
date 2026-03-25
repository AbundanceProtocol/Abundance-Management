import type { TaskWorkspaceState } from "./workspaceTypes";

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
  depth: number; // 0 = top-level row under the section
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
  /**
   * When true, direct child rows (and their descendants) are omitted from the section list on the board;
   * open this task’s page to work on subtasks.
   */
  hideSubtasksOnMainBoard?: boolean;
  tags: string[];
  /** When set and not `none`, completing the task logs a date and advances `dueDate`. */
  repeatFrequency?: RepeatFrequency;
  /** 0–6 Sun–Sat; used when `repeatFrequency` is `weekly`. */
  repeatWeekdays?: number[];
  /** YYYY-MM-DD entries when a recurring instance was completed. */
  completionHistory?: string[];
  /** Visual canvas for this task (media + markdown); only meaningful on the anchor task for a workspace page. */
  workspace?: TaskWorkspaceState;
  /** Optional linked standalone page id. */
  linkedPageId?: string | null;
  /**
   * When set, this task is selected for "Today’s focus".
   * Stored as a YYYY-MM-DD local date corresponding to the active focus period
   * (which resets daily at 2:00am local time).
   */
  todayFocusDate?: string | null;
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
