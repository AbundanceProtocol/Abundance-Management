import type { TaskItem } from "./types";

/** True if the user has entered anything beyond a freshly created empty row. */
export function taskHasAnyUserData(task: TaskItem): boolean {
  if (task.title.trim().length > 0) return true;
  if (task.notes.trim().length > 0) return true;
  if (task.recurringNotesPageId) return true;
  if (task.recurringCompletionUntilIso) return true;
  if ((task.urls ?? []).some((u) => u.trim().length > 0)) return true;
  if (task.startDate || task.dueDate) return true;
  if (task.dueTime?.trim()) return true;
  if (task.timeEstimate != null) return true;
  if (task.tags.length > 0) return true;
  if (task.isCriticalPath) return true;
  if (task.completed) return true;
  if (task.isSequential) return true;
  if (task.collapsed) return true;
  if (task.priority === "high" || task.priority === "low") return true;
  if (task.repeatFrequency && task.repeatFrequency !== "none") return true;
  if ((task.completionHistory?.length ?? 0) > 0) return true;
  return false;
}
