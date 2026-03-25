import { TaskItem } from "./types";
import { filterSubtreeTasks } from "./taskSubtree";

/** Root first, then depth-first preorder (children sorted by `order`). */
export function subtreeNodesPreorder(
  tasks: TaskItem[],
  rootId: string
): TaskItem[] {
  const subtree = filterSubtreeTasks(tasks, rootId);
  const root = subtree.find((t) => t._id === rootId);
  if (!root) return [];

  function walk(parentId: string): TaskItem[] {
    const children = subtree
      .filter((t) => t.parentId === parentId)
      .sort(
        (a, b) => a.order - b.order || a._id.localeCompare(b._id)
      );
    const out: TaskItem[] = [];
    for (const c of children) {
      out.push(c);
      out.push(...walk(c._id));
    }
    return out;
  }

  return [root, ...walk(rootId)];
}
