export type TimeUnit = "minutes" | "hours" | "days";

export type TaskPriority = "low" | "medium" | "high";

/** How top-level tasks (parentId null) are ordered within a section. Nested tasks always follow manual `order`. */
export type TopLevelSort = "manual" | "priority" | "startDate";

export type SectionType = "project" | "recurring" | "todo";

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
  url: string;
  startDate: string | null;
  dueDate: string | null;
  isCriticalPath: boolean;
  isSequential: boolean;
  collapsed: boolean;
  tags: string[];
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
