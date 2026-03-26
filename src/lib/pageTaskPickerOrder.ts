import {
  buildVisibleTaskTree,
  coerceTopLevelSort,
  flattenTasksTree,
  tasksInSection,
} from "@/lib/timelineUtils";
import type { Section, TaskItem } from "@/lib/types";

function isDescendantOf(tasks: TaskItem[], taskId: string, ancestorId: string): boolean {
  let current = tasks.find((t) => t._id === taskId);
  while (current?.parentId) {
    const pid = current.parentId;
    if (pid === ancestorId) return true;
    current = tasks.find((t) => t._id === pid);
  }
  return false;
}

/**
 * Same ordering as the main board: depth-first, sibling order from `order` / `topLevelSort`.
 * - With a page root task: that task first, then descendants in tree order.
 * - Without: sections in `order`, then each section’s task tree (roots then nested).
 */
export function orderTasksForPageLinkPicker(
  tasks: TaskItem[],
  sections: Section[],
  linkedRootId: string | null
): TaskItem[] {
  if (linkedRootId) {
    const root = tasks.find((t) => t._id === linkedRootId);
    if (!root) return [];

    const allowed = tasks.filter(
      (t) => t._id === linkedRootId || isDescendantOf(tasks, t._id, linkedRootId)
    );
    const section = sections.find((s) => s._id === root.sectionId);
    const topLevelSort = coerceTopLevelSort(section?.topLevelSort ?? "manual");
    const descendants = buildVisibleTaskTree(allowed, linkedRootId, new Set(), topLevelSort);
    return [root, ...descendants];
  }

  const sectionSorted = [...sections].sort((a, b) => a.order - b.order);
  const out: TaskItem[] = [];
  for (const sec of sectionSorted) {
    const inSec = tasksInSection(tasks, sec._id);
    out.push(
      ...flattenTasksTree(inSec, coerceTopLevelSort(sec.topLevelSort ?? "manual"))
    );
  }
  return out;
}
