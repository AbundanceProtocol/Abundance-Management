import { TaskItem } from "./types";
import { MAX_TASK_DEPTH } from "./constants";

export interface ReorderItem {
  _id: string;
  order: number;
  parentId: string | null;
  depth: number;
  sectionId: string;
}

/** True if `descendantId` is anywhere under `ancestorId` in the tree. */
export function isUnderTask(
  tasks: TaskItem[],
  descendantId: string,
  ancestorId: string
): boolean {
  let t: TaskItem | undefined = tasks.find((x) => x._id === descendantId);
  while (t) {
    const pid = t.parentId;
    if (!pid) break;
    if (pid === ancestorId) return true;
    t = tasks.find((x) => x._id === pid);
  }
  return false;
}

/** All descendants of rootId (not including root). */
function collectDescendants(rootId: string, tasks: TaskItem[]): TaskItem[] {
  const out: TaskItem[] = [];
  function walk(parentId: string) {
    const children = tasks
      .filter((t) => t.parentId === parentId)
      .sort((a, b) => a.order - b.order);
    for (const c of children) {
      out.push(c);
      walk(c._id);
    }
  }
  walk(rootId);
  return out;
}

/**
 * Move active as last child of over (nest). Returns null if invalid.
 */
export function computeNestMove(
  tasks: TaskItem[],
  activeTask: TaskItem,
  overTask: TaskItem
): ReorderItem[] | null {
  if (activeTask._id === overTask._id) return null;
  if (activeTask.sectionId !== overTask.sectionId) return null;
  if (overTask.depth >= MAX_TASK_DEPTH) return null;

  if (isUnderTask(tasks, overTask._id, activeTask._id)) return null;

  const newParentId = overTask._id;
  const newDepthActive = overTask.depth + 1;
  const delta = newDepthActive - activeTask.depth;

  const descendants = collectDescendants(activeTask._id, tasks);
  const subtree: TaskItem[] = [activeTask, ...descendants];

  for (const t of subtree) {
    if (t.depth + delta > MAX_TASK_DEPTH) return null;
  }

  const sectionId = overTask.sectionId;
  const updates: ReorderItem[] = [];

  const oldSiblings = tasks
    .filter(
      (t) =>
        t.sectionId === sectionId &&
        t.parentId === activeTask.parentId &&
        t._id !== activeTask._id
    )
    .sort((a, b) => a.order - b.order);

  oldSiblings.forEach((t, i) => {
    updates.push({
      _id: t._id,
      order: i,
      parentId: t.parentId,
      depth: t.depth,
      sectionId: t.sectionId,
    });
  });

  const othersUnderOver = tasks
    .filter(
      (t) =>
        t.sectionId === sectionId &&
        t.parentId === newParentId &&
        t._id !== activeTask._id
    )
    .sort((a, b) => a.order - b.order);

  const newOrderActive = othersUnderOver.length;

  updates.push({
    _id: activeTask._id,
    order: newOrderActive,
    parentId: newParentId,
    depth: newDepthActive,
    sectionId,
  });

  for (const d of descendants) {
    updates.push({
      _id: d._id,
      order: d.order,
      parentId: d.parentId,
      depth: d.depth + delta,
      sectionId,
    });
  }

  return mergeUpdatesById(updates);
}

/**
 * Same parent as `over`: insert active before over among siblings.
 * Renumbers old parent when moving between parents; shifts subtree depths.
 */
export function computeSiblingMove(
  tasks: TaskItem[],
  activeTask: TaskItem,
  overTask: TaskItem
): ReorderItem[] | null {
  if (activeTask.sectionId !== overTask.sectionId) return null;

  const targetSectionId = overTask.sectionId;
  const targetParentId = overTask.parentId;
  const targetDepth = overTask.depth;
  const depthDelta = targetDepth - activeTask.depth;

  const descendants = collectDescendants(activeTask._id, tasks);
  for (const d of descendants) {
    if (d.depth + depthDelta > MAX_TASK_DEPTH) return null;
  }

  const updates: ReorderItem[] = [];
  const oldParentId = activeTask.parentId;
  const oldSectionId = activeTask.sectionId;

  if (oldParentId !== targetParentId) {
    const oldSiblings = tasks
      .filter(
        (t) =>
          t.sectionId === oldSectionId &&
          t.parentId === oldParentId &&
          t._id !== activeTask._id
      )
      .sort((a, b) => a.order - b.order);
    oldSiblings.forEach((t, i) => {
      updates.push({
        _id: t._id,
        order: i,
        parentId: oldParentId,
        depth: t.depth,
        sectionId: oldSectionId,
      });
    });
  }

  const siblings = tasks
    .filter(
      (t) =>
        t.sectionId === targetSectionId &&
        t.parentId === targetParentId &&
        t._id !== activeTask._id
    )
    .sort((a, b) => a.order - b.order);

  const overIndex = siblings.findIndex((t) => t._id === overTask._id);
  const insertIndex = overIndex === -1 ? siblings.length : overIndex;

  const next = [...siblings];
  next.splice(insertIndex, 0, {
    ...activeTask,
    sectionId: targetSectionId,
    parentId: targetParentId,
    depth: targetDepth,
  });

  next.forEach((t, i) => {
    updates.push({
      _id: t._id,
      order: i,
      parentId: targetParentId,
      depth: targetDepth,
      sectionId: targetSectionId,
    });
  });

  for (const d of descendants) {
    updates.push({
      _id: d._id,
      order: d.order,
      parentId: d.parentId,
      depth: d.depth + depthDelta,
      sectionId: targetSectionId,
    });
  }

  return mergeUpdatesById(updates);
}

/**
 * Same parent as `afterTask`: insert active **after** `afterTask` among siblings.
 */
export function computeSiblingMoveAfter(
  tasks: TaskItem[],
  activeTask: TaskItem,
  afterTask: TaskItem
): ReorderItem[] | null {
  if (activeTask.sectionId !== afterTask.sectionId) return null;

  const targetSectionId = afterTask.sectionId;
  const targetParentId = afterTask.parentId;
  const targetDepth = afterTask.depth;
  const depthDelta = targetDepth - activeTask.depth;

  const descendants = collectDescendants(activeTask._id, tasks);
  for (const d of descendants) {
    if (d.depth + depthDelta > MAX_TASK_DEPTH) return null;
  }

  const updates: ReorderItem[] = [];
  const oldParentId = activeTask.parentId;
  const oldSectionId = activeTask.sectionId;

  if (oldParentId !== targetParentId) {
    const oldSiblings = tasks
      .filter(
        (t) =>
          t.sectionId === oldSectionId &&
          t.parentId === oldParentId &&
          t._id !== activeTask._id
      )
      .sort((a, b) => a.order - b.order);
    oldSiblings.forEach((t, i) => {
      updates.push({
        _id: t._id,
        order: i,
        parentId: oldParentId,
        depth: t.depth,
        sectionId: oldSectionId,
      });
    });
  }

  const siblings = tasks
    .filter(
      (t) =>
        t.sectionId === targetSectionId &&
        t.parentId === targetParentId &&
        t._id !== activeTask._id
    )
    .sort((a, b) => a.order - b.order);

  const afterIndex = siblings.findIndex((t) => t._id === afterTask._id);
  if (afterIndex === -1) return null;

  const insertIndex = afterIndex + 1;

  const next = [...siblings];
  next.splice(insertIndex, 0, {
    ...activeTask,
    sectionId: targetSectionId,
    parentId: targetParentId,
    depth: targetDepth,
  });

  next.forEach((t, i) => {
    updates.push({
      _id: t._id,
      order: i,
      parentId: targetParentId,
      depth: targetDepth,
      sectionId: targetSectionId,
    });
  });

  for (const d of descendants) {
    updates.push({
      _id: d._id,
      order: d.order,
      parentId: d.parentId,
      depth: d.depth + depthDelta,
      sectionId: targetSectionId,
    });
  }

  return mergeUpdatesById(updates);
}

function mergeUpdatesById(updates: ReorderItem[]): ReorderItem[] {
  const map = new Map<string, ReorderItem>();
  for (const u of updates) {
    map.set(u._id, u);
  }
  return Array.from(map.values());
}
