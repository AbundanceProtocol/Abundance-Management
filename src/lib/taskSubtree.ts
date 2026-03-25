import { TaskItem } from "./types";

/** True if `task` is `rootId` or a descendant of `rootId` within the same section. */
export function isTaskInSubtree(
  task: TaskItem,
  rootId: string,
  byId: Map<string, TaskItem>
): boolean {
  if (task._id === rootId) return true;
  let pid: string | null | undefined = task.parentId;
  const seen = new Set<string>();
  while (pid) {
    if (pid === rootId) return true;
    if (seen.has(pid)) break;
    seen.add(pid);
    pid = byId.get(pid)?.parentId ?? null;
  }
  return false;
}

/** True if `task` is under a parent/ancestor that hides its subtree from the board list. */
export function isHiddenFromMainBoardByAncestor(
  task: TaskItem,
  byId: Map<string, TaskItem>
): boolean {
  let pid: string | null | undefined = task.parentId;
  while (pid) {
    const p = byId.get(pid);
    if (!p) break;
    if (p.hideSubtasksOnMainBoard === true) return true;
    pid = p.parentId;
  }
  return false;
}

export function filterSubtreeTasks(
  tasks: TaskItem[],
  anchorId: string
): TaskItem[] {
  const anchor = tasks.find((t) => t._id === anchorId);
  if (!anchor) return [];
  const byId = new Map(tasks.map((t) => [t._id, t]));
  return tasks.filter(
    (t) =>
      t.sectionId === anchor.sectionId && isTaskInSubtree(t, anchorId, byId)
  );
}
