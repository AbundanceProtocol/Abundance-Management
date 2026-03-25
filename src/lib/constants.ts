/**
 * Maximum nesting depth index (0 = top-level under the section).
 * Kept high so deep trees are allowed; UI uses task zoom for manageable lists.
 */
export const MAX_TASK_DEPTH = 100;

/** Hover this long on the strip *below* a row to nest into that row; shorter = move after that row (sibling). */
export const NEST_HOVER_MS = 2000;

/** Droppable id prefix — zone is directly under the task row, not on the row. */
export const NEST_BELOW_PREFIX = "nest-below-";

/** After duplicating from task zoom, open this task on the board. */
export const DUPLICATE_SELECT_TASK_STORAGE_KEY =
  "abundance-duplicate-select-task";
