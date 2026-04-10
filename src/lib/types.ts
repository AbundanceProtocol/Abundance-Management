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
  /**
   * When true, direct children cannot be drag-reordered under this parent (board + task page lists).
   * Hierarchy can still be changed from each task’s details (parent picker / attach).
   */
  lockSubtaskDrag?: boolean;
  tags: string[];
  /** Free-form label for grouping; empty = uncategorized. Used when section sorts by category. */
  category?: string;
  /** When set and not `none`, completing the task logs a date and advances `dueDate`. */
  repeatFrequency?: RepeatFrequency;
  /** 0–6 Sun–Sat; used when `repeatFrequency` is `weekly`. */
  repeatWeekdays?: number[];
  /** YYYY-MM-DD entries when a recurring instance was completed. */
  completionHistory?: string[];
  /**
   * For recurring habits (`repeatFrequency` not `none`): relative importance 1–10 for weighted
   * completion stats. Defaults to 5 when missing.
   */
  taskWeight?: number;
  /**
   * When set for tasks inside a `recurring` section, the page storing
   * "notes by date" for this task.
   */
  recurringNotesPageId?: string | null;
  /**
   * For tasks inside a `recurring` section: temporary completion marker that
   * stays "checked" until (and only until) the stored time passes.
   *
   * Used to keep the UI showing "complete until 2am local time" behavior.
   */
  recurringCompletionUntilIso?: string | null;
  /** Visual canvas for this task (media + markdown); only meaningful on the anchor task for a workspace page. */
  workspace?: TaskWorkspaceState;
  /** Optional linked standalone page id. */
  linkedPageId?: string | null;
  /** Optional linked mind map id. */
  mindMapId?: string | null;
  /** When true, task only lives inside a mind map and is hidden from the Tasks board. */
  mindMapOnly?: boolean;
  /**
   * When set, this task is selected for "Today’s focus".
   * Stored as a YYYY-MM-DD local date corresponding to the active focus period
   * (which resets daily at 2:00am local time).
   */
  todayFocusDate?: string | null;
  /** Google Calendar event ID when this task has been pushed to GCal. */
  googleCalendarEventId?: string | null;
  /** ISO timestamp of the last successful GCal push. */
  googleCalendarSyncedAt?: string | null;
  /** Sync state: synced | pending | error — absent means never synced. */
  googleCalendarSyncStatus?: "synced" | "pending" | "error" | null;
  /** IDs of ViewTokens this task is hidden from. Subtasks are auto-hidden when a parent is hidden. */
  hiddenFromViews?: string[];
  createdAt: string;
  updatedAt: string;
}

/** A named read-only share link. The `token` field is the URL-safe secret in the share URL. */
export interface ViewToken {
  _id: string;
  name: string;
  token: string;
  createdAt: string;
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
  /**
   * When true, top-level tasks are grouped under category headings; order within each group
   * follows `topLevelSort` (independent toggle).
   */
  groupByCategory?: boolean;
}

export type NewTask = Omit<TaskItem, "_id" | "createdAt" | "updatedAt">;
