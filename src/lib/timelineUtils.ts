import { Section, TaskItem, TaskPriority, TopLevelSort } from "./types";

function priorityRank(p: TaskPriority | undefined): number {
  switch (p ?? "medium") {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

/** High before medium before low; tie-break by manual order. */
export function compareTaskPriority(a: TaskItem, b: TaskItem): number {
  return priorityRank(b.priority) - priorityRank(a.priority);
}

/** Earlier start first; missing start dates last. */
export function compareTaskStartDate(a: TaskItem, b: TaskItem): number {
  const sa = a.startDate?.trim();
  const sb = b.startDate?.trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb);
}

/** Legacy DB values: `topLevelSort: "category"` was removed; treat as manual ordering. */
export function coerceTopLevelSort(
  v: TopLevelSort | string | undefined
): TopLevelSort {
  if (v === "category") return "manual";
  if (v === "priority" || v === "startDate") return v;
  return "manual";
}

export function normalizeCategoryKey(task: TaskItem): string {
  return (task.category ?? "").trim();
}

function sortCategoryKeys(keys: string[]): string[] {
  const hasEmpty = keys.includes("");
  const nonEmpty = keys
    .filter((k) => k !== "")
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return hasEmpty ? [...nonEmpty, ""] : nonEmpty;
}

/**
 * Depth-first list: category groups (alphabetically, uncategorized last), then within each
 * group roots follow `topLevelSort`, then each root’s subtree as in `buildVisibleTaskTree`.
 */
export function buildFlatTasksGroupedByCategory(
  tasksPool: TaskItem[],
  collapsedIds: Set<string>,
  topLevelSort: TopLevelSort
): TaskItem[] {
  const sort = coerceTopLevelSort(topLevelSort);
  const roots = tasksPool.filter((t) => t.parentId === null);
  const byCat = new Map<string, TaskItem[]>();
  for (const r of roots) {
    const k = normalizeCategoryKey(r);
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(r);
  }
  const keys = sortCategoryKeys([...byCat.keys()]);
  const out: TaskItem[] = [];
  for (const k of keys) {
    const groupRoots = [...(byCat.get(k) ?? [])].sort((a, b) =>
      compareSiblingOrder(a, b, true, sort)
    );
    for (const root of groupRoots) {
      out.push(root);
      out.push(
        ...buildVisibleTaskTree(tasksPool, root._id, collapsedIds, sort)
      );
    }
  }
  return out;
}

export function compareSiblingOrder(
  a: TaskItem,
  b: TaskItem,
  isTopLevel: boolean,
  topLevelSort: TopLevelSort
): number {
  const tls = coerceTopLevelSort(topLevelSort);
  if (!isTopLevel || tls === "manual") {
    return a.order - b.order || a._id.localeCompare(b._id);
  }
  if (tls === "priority") {
    const c = compareTaskPriority(a, b);
    if (c !== 0) return c;
    return a.order - b.order || a._id.localeCompare(b._id);
  }
  const c = compareTaskStartDate(a, b);
  if (c !== 0) return c;
  return a.order - b.order || a._id.localeCompare(b._id);
}

const MS_DAY = 86_400_000;

/** In sequential chains, explicit start may sit above the chain cursor (user "not before" date). Dates beyond this gap are treated as stale and ignored so followers don't jump months ahead. */
const MAX_EXPLICIT_START_LIFT_MS = 60 * MS_DAY;

/** Convert time estimate to a duration in days (work-day-ish: 8h = 1 day). */
export function estimateToDays(task: TaskItem): number {
  if (task.timeEstimate == null || task.timeEstimate <= 0) return 1;
  const n = task.timeEstimate;
  switch (task.timeUnit) {
    case "minutes":
      return Math.max(1 / 16, n / (60 * 8));
    case "hours":
      return Math.max(0.25, n / 8);
    case "days":
    default:
      return Math.max(1, n);
  }
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export interface TaskDateRange {
  task: TaskItem;
  start: Date;
  end: Date;
}

/** All tasks belonging to a section (any depth). */
export function tasksInSection(
  tasks: TaskItem[],
  sectionId: string
): TaskItem[] {
  return tasks.filter((t) => t.sectionId === sectionId);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_DAY);
}

/** Critical path "focused" view: include bars starting within this many days, or that ended recently. */
export const FOCUS_WINDOW_DAYS = 14;

/**
 * True when a Gantt bar should show in focused view: overlaps [today, today+FOCUS_WINDOW_DAYS],
 * or ended on/before today but not before the lookback window (already due / recently completed).
 */
export function taskRangeInFocusedWindow(
  r: TaskDateRange,
  now: Date = new Date()
): boolean {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + MS_DAY - 1);
  const windowEnd = addDays(startOfToday, FOCUS_WINDOW_DAYS);
  windowEnd.setHours(23, 59, 59, 999);
  const lookbackStart = addDays(startOfToday, -FOCUS_WINDOW_DAYS);

  const { start, end } = r;
  if (
    end.getTime() >= startOfToday.getTime() &&
    start.getTime() <= windowEnd.getTime()
  ) {
    return true;
  }
  if (
    end.getTime() <= endOfToday.getTime() &&
    end.getTime() >= lookbackStart.getTime()
  ) {
    return true;
  }
  return false;
}

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function formatMonthShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short" });
}

export function formatQuarter(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q}`;
}

export function formatWeekLabel(d: Date): string {
  const s = startOfWeekMonday(d);
  const oneJan = new Date(s.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((s.getTime() - oneJan.getTime()) / MS_DAY + oneJan.getDay() + 1) / 7
  );
  return String(week);
}

/** Depth-first order, same as list order in the UI. Top-level siblings respect `topLevelSort`. */
export function flattenTasksTree(
  tasks: TaskItem[],
  topLevelSort: TopLevelSort = "manual"
): TaskItem[] {
  const out: TaskItem[] = [];
  function walk(parentId: string | null) {
    const children = tasks
      .filter((t) => t.parentId === parentId)
      .sort((a, b) =>
        compareSiblingOrder(a, b, parentId === null, topLevelSort)
      );
    for (const c of children) {
      out.push(c);
      walk(c._id);
    }
  }
  walk(null);
  return out;
}

/**
 * Same DFS order as the task list; omits descendants when an ancestor has `collapsed: true`.
 */
export function buildVisibleTaskTree(
  tasks: TaskItem[],
  parentId: string | null,
  collapsedIds: Set<string>,
  topLevelSort: TopLevelSort = "manual"
): TaskItem[] {
  const children = tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) =>
      compareSiblingOrder(a, b, parentId === null, topLevelSort)
    );

  const result: TaskItem[] = [];
  for (const child of children) {
    result.push(child);
    if (!collapsedIds.has(child._id)) {
      result.push(
        ...buildVisibleTaskTree(tasks, child._id, collapsedIds, topLevelSort)
      );
    }
  }
  return result;
}

export function hasExplicitStartDate(task: TaskItem): boolean {
  return Boolean(task.startDate && String(task.startDate).trim() !== "");
}

function hasExplicitDueDate(task: TaskItem): boolean {
  return Boolean(task.dueDate && String(task.dueDate).trim() !== "");
}

function minAnchorFromExplicitDates(tasks: TaskItem[]): Date | null {
  const times: number[] = [];
  for (const t of tasks) {
    if (t.startDate) times.push(parseYmd(t.startDate).getTime());
    if (t.dueDate) times.push(parseYmd(t.dueDate).getTime());
  }
  if (times.length === 0) return null;
  return new Date(Math.min(...times));
}

export type TaskRangeChainedOptions = {
  /**
   * Under a sequential parent, non-first siblings must start at the chain cursor.
   * Ignores isolated start/due fields that would otherwise leave gaps between siblings.
   */
  enforceChainStart?: boolean;
};

/**
 * Chained placement: explicit dates win; otherwise tasks are laid end-to-end from `cursor`.
 */
export function taskToRangeChained(
  task: TaskItem,
  cursor: Date,
  options?: TaskRangeChainedOptions
): TaskDateRange {
  const durMs = estimateToDays(task) * MS_DAY;
  const hasStart = task.startDate != null && task.startDate !== "";
  const hasDue = task.dueDate != null && task.dueDate !== "";

  if (options?.enforceChainStart) {
    // Chain position from prior tasks; modest explicit start delays the bar (user "not before" constraint).
    // Ignore explicit starts far beyond the chain — usually leftover DB dates — so only downstream work shifts.
    let start = new Date(cursor);
    if (hasStart) {
      const explicitStart = parseYmd(task.startDate!);
      const lift = explicitStart.getTime() - start.getTime();
      if (lift > 0 && lift <= MAX_EXPLICIT_START_LIFT_MS) {
        start = explicitStart;
      }
    }
    let spanMs: number;
    if (hasStart && hasDue) {
      const explicitStart = parseYmd(task.startDate!);
      const explicitEnd = parseYmd(task.dueDate!);
      spanMs = Math.max(
        MS_DAY * 0.25,
        explicitEnd.getTime() - explicitStart.getTime()
      );
    } else if (hasStart && !hasDue) {
      spanMs = Math.max(MS_DAY * 0.25, durMs);
    } else if (!hasStart && hasDue) {
      const endPreferred = parseYmd(task.dueDate!);
      const endFromDur = start.getTime() + durMs;
      return {
        task,
        start,
        end: new Date(Math.max(endPreferred.getTime(), endFromDur)),
      };
    } else if (task.timeEstimate != null && task.timeEstimate > 0) {
      spanMs = durMs;
    } else if (task.isCriticalPath) {
      spanMs = Math.max(durMs, MS_DAY);
    } else {
      spanMs = MS_DAY;
    }
    return { task, start, end: new Date(start.getTime() + spanMs) };
  }

  if (hasStart && hasDue) {
    const start = parseYmd(task.startDate!);
    const end = parseYmd(task.dueDate!);
    if (end < start) return { task, start, end: start };
    return { task, start, end };
  }
  if (hasStart) {
    const start = parseYmd(task.startDate!);
    const end = new Date(start.getTime() + durMs);
    return { task, start, end };
  }
  if (hasDue) {
    const end = parseYmd(task.dueDate!);
    const start = new Date(end.getTime() - durMs);
    return { task, start, end };
  }
  if (task.timeEstimate != null && task.timeEstimate > 0) {
    const start = new Date(cursor);
    const end = new Date(start.getTime() + durMs);
    return { task, start, end };
  }
  if (task.isCriticalPath) {
    const start = new Date(cursor);
    const end = new Date(start.getTime() + Math.max(durMs, MS_DAY));
    return { task, start, end };
  }
  // Undated tasks with no estimate still need a row (e.g. subtasks under a non-sequential parent;
  // the enforceChainStart branch always emits a range, but this branch does not).
  const start = new Date(cursor);
  const end = new Date(start.getTime() + Math.max(durMs, MS_DAY * 0.25));
  return { task, start, end };
}

/**
 * Where to start the next bar when dates/estimates are inferred from the cursor.
 * - Root tasks: chain only if the section is sequential; otherwise parallel at `anchor`.
 * - Child tasks: chain only if the parent task is sequential; otherwise align to parent.start (parallel siblings).
 */
function startCursorForTask(
  task: TaskItem,
  cursor: Date,
  anchor: Date,
  sectionIsSequential: boolean,
  taskById: Map<string, TaskItem>,
  rangeById: Map<string, TaskDateRange>,
  isFirstChildAmongSiblings: boolean,
  isFirstRootAmongRoots: boolean
): Date {
  if (task.parentId === null) {
    if (!sectionIsSequential) return new Date(anchor);
    // First top-level task may anchor the chain with an explicit start; others follow the cursor.
    if (isFirstRootAmongRoots && hasExplicitStartDate(task)) {
      return parseYmd(task.startDate!);
    }
    return new Date(cursor);
  }
  const parent = taskById.get(task.parentId);
  const parentRange = rangeById.get(task.parentId);
  if (!parent || !parentRange) return new Date(cursor);
  if (!parent.isSequential) return new Date(parentRange.start);
  // Sequential parent: first subtask shares the parent's start (concurrent).
  if (isFirstChildAmongSiblings) return new Date(parentRange.start);
  return new Date(cursor);
}

/** True if this task is not the first in a sequential sibling group (section roots or under a sequential parent). */
function isSequentialChainFollower(
  task: TaskItem,
  sectionIsSequential: boolean,
  rootsOrdered: TaskItem[],
  childrenByParent: Map<string | null, TaskItem[]>,
  taskById: Map<string, TaskItem>
): boolean {
  if (task.parentId === null) {
    if (!sectionIsSequential || rootsOrdered.length === 0) return false;
    return rootsOrdered[0]!._id !== task._id;
  }
  const sibs = childrenByParent.get(task.parentId) ?? [];
  const parent = taskById.get(task.parentId);
  if (!parent?.isSequential || sibs.length === 0) return false;
  return sibs[0]!._id !== task._id;
}

export function buildProjectRanges(
  projectTasks: TaskItem[],
  section: Pick<Section, "isSequential" | "topLevelSort">
): { ranges: TaskDateRange[]; rangeStart: Date; rangeEnd: Date } {
  const topLevelSort = section.topLevelSort ?? "manual";
  const ordered = flattenTasksTree(projectTasks, topLevelSort);
  const anchor =
    minAnchorFromExplicitDates(projectTasks) ?? startOfMonth(new Date());

  const sectionIsSequential = section.isSequential ?? false;
  const taskById = new Map(projectTasks.map((t) => [t._id, t]));
  const rangeById = new Map<string, TaskDateRange>();

  const childrenByParent = new Map<string | null, TaskItem[]>();
  for (const t of projectTasks) {
    const pid = t.parentId;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid)!.push(t);
  }
  for (const [pid, list] of childrenByParent) {
    list.sort((a, b) =>
      compareSiblingOrder(a, b, pid === null, topLevelSort)
    );
  }

  const rootsOrdered = childrenByParent.get(null) ?? [];

  const ranges: TaskDateRange[] = [];
  let cursor = new Date(anchor);

  for (const t of ordered) {
    const siblings = t.parentId ? childrenByParent.get(t.parentId) ?? [] : [];
    const isFirstChildAmongSiblings =
      t.parentId !== null &&
      siblings.length > 0 &&
      siblings[0]!._id === t._id;

    const isFirstRootAmongRoots =
      t.parentId === null &&
      rootsOrdered.length > 0 &&
      rootsOrdered[0]!._id === t._id;

    const startAt = startCursorForTask(
      t,
      cursor,
      anchor,
      sectionIsSequential,
      taskById,
      rangeById,
      isFirstChildAmongSiblings,
      isFirstRootAmongRoots
    );

    const parent = t.parentId ? taskById.get(t.parentId) : undefined;
    // Sequential section: every root after the first follows the chain (ignores stale stored dates).
    // Sequential parent: same for children after the first.
    const enforceChainStart =
      Boolean(t.parentId === null && sectionIsSequential) ||
      Boolean(parent?.isSequential && t.parentId !== null);

    const r = taskToRangeChained(t, startAt, { enforceChainStart });
    ranges.push(r);
    rangeById.set(t._id, r);
    cursor = new Date(r.end.getTime() + MS_DAY * 0.25);
  }

  /** Parents span from earliest descendant start to latest descendant end (union with own bar). */

  const envelope = new Map<string, { start: number; end: number }>();
  for (const t of [...ordered].reverse()) {
    const selfRange = rangeById.get(t._id);
    const kids = childrenByParent.get(t._id) ?? [];

    const selfStart = selfRange ? selfRange.start.getTime() : Number.POSITIVE_INFINITY;
    const selfEnd = selfRange ? selfRange.end.getTime() : Number.NEGATIVE_INFINITY;

    let descMin = Number.POSITIVE_INFINITY;
    let descMax = Number.NEGATIVE_INFINITY;
    for (const k of kids) {
      const ev = envelope.get(k._id);
      if (!ev) continue;
      descMin = Math.min(descMin, ev.start);
      descMax = Math.max(descMax, ev.end);
    }
    const hasDesc = descMin <= descMax;

    const chainFollower = isSequentialChainFollower(
      t,
      sectionIsSequential,
      rootsOrdered,
      childrenByParent,
      taskById
    );

    let startMs: number;
    let endMs: number;

    if (chainFollower && selfRange) {
      // Keep chained placement from the first pass; do not snap to outdated stored dates.
      startMs = selfStart;
      endMs = selfEnd;
      if (hasDesc) {
        startMs = Math.min(startMs, descMin);
        endMs = Math.max(endMs, descMax);
      }
    } else if (hasExplicitStartDate(t)) {
      startMs = parseYmd(t.startDate!).getTime();
      if (hasExplicitDueDate(t)) {
        const dueT = parseYmd(t.dueDate!).getTime();
        endMs = Math.max(dueT, hasDesc ? descMax : Number.NEGATIVE_INFINITY, selfEnd);
      } else if (hasDesc || selfRange) {
        endMs = Math.max(selfEnd, hasDesc ? descMax : Number.NEGATIVE_INFINITY);
      } else {
        endMs = Number.NEGATIVE_INFINITY;
      }
    } else if (hasDesc) {
      // No explicit parent start: align with first subtask (ignore inferred parent-only start).
      startMs = descMin;
      if (hasExplicitDueDate(t)) {
        const dueT = parseYmd(t.dueDate!).getTime();
        endMs = Math.max(dueT, descMax, selfEnd);
      } else {
        endMs = Math.max(selfEnd, descMax);
      }
    } else if (selfRange) {
      startMs = selfStart;
      if (hasExplicitDueDate(t)) {
        const dueT = parseYmd(t.dueDate!).getTime();
        endMs = Math.max(dueT, hasDesc ? descMax : Number.NEGATIVE_INFINITY, selfEnd);
      } else if (hasDesc) {
        endMs = Math.max(selfEnd, descMax);
      } else {
        endMs = selfEnd;
      }
    } else {
      startMs = Number.POSITIVE_INFINITY;
      endMs = Number.NEGATIVE_INFINITY;
    }

    if (endMs < startMs) endMs = startMs;

    const hasKidsEnvelope = kids.some((k) => envelope.has(k._id));
    if (startMs <= endMs && (selfRange || hasKidsEnvelope)) {
      envelope.set(t._id, { start: startMs, end: endMs });
    }
  }

  for (let i = 0; i < ranges.length; i++) {
    const ev = envelope.get(ranges[i]!.task._id);
    if (!ev) continue;
    ranges[i] = {
      task: ranges[i]!.task,
      start: new Date(ev.start),
      end: new Date(ev.end),
    };
  }

  if (ranges.length === 0) {
    const now = new Date();
    return {
      ranges: [],
      rangeStart: addDays(now, -7),
      rangeEnd: addDays(now, 60),
    };
  }

  let minT = ranges[0].start.getTime();
  let maxT = ranges[0].end.getTime();
  for (const r of ranges) {
    minT = Math.min(minT, r.start.getTime());
    maxT = Math.max(maxT, r.end.getTime());
  }

  const padMs = MS_DAY * 7;
  return {
    ranges,
    rangeStart: new Date(minT - padMs),
    rangeEnd: new Date(maxT + padMs),
  };
}

/** localStorage key for project focused view (board list + Gantt). */
export const PROJECT_FOCUSED_VIEW_STORAGE_KEY = "abundance-critical-path-focused";

/**
 * Task IDs for the main list when the project is in focused view (same row rules as the Gantt).
 * Includes ancestors of any in-window task so the path to the root stays visible.
 */
export function computeProjectFocusedMainTaskIds(
  sectionTasks: TaskItem[],
  section: Pick<Section, "isSequential" | "topLevelSort">
): Set<string> {
  const { ranges } = buildProjectRanges(sectionTasks, section);
  const taskById = new Map(sectionTasks.map((t) => [t._id, t]));
  const rangeMatch = new Set<string>();
  for (const r of ranges) {
    if (!(r.task.parentId !== null || hasExplicitStartDate(r.task))) continue;
    if (!taskRangeInFocusedWindow(r)) continue;
    rangeMatch.add(r.task._id);
  }
  const out = new Set<string>();
  for (const id of rangeMatch) {
    let cur = taskById.get(id);
    while (cur) {
      out.add(cur._id);
      if (!cur.parentId) break;
      cur = taskById.get(cur.parentId);
    }
  }
  return out;
}

/**
 * Tasks whose top-level root has no start and no due date (entire subtree — shown in the Unscheduled group when focused).
 */
export function computeUndatedProjectSubtreeIds(sectionTasks: TaskItem[]): Set<string> {
  const byId = new Map(sectionTasks.map((t) => [t._id, t]));
  function rootOf(t: TaskItem): TaskItem {
    let cur = t;
    while (cur.parentId) {
      const p = byId.get(cur.parentId);
      if (!p) break;
      cur = p;
    }
    return cur;
  }
  const undatedRootIds = new Set<string>();
  for (const t of sectionTasks) {
    if (t.parentId === null && !t.startDate?.trim() && !t.dueDate?.trim()) {
      undatedRootIds.add(t._id);
    }
  }
  const out = new Set<string>();
  for (const t of sectionTasks) {
    if (undatedRootIds.has(rootOf(t)._id)) out.add(t._id);
  }
  return out;
}
