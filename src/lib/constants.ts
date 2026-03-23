/**
 * Maximum task depth index (0 = top-level under the section).
 * depth 0..4 → 5 visual tiers (root + 4 levels of nesting).
 * Previously capped at 3, which made a 3rd nested tier easy to miss in UX.
 */
export const MAX_TASK_DEPTH = 4;

/** Hover this long on the strip *below* a row to nest into that row; shorter = move after that row (sibling). */
export const NEST_HOVER_MS = 2000;

/** Droppable id prefix — zone is directly under the task row, not on the row. */
export const NEST_BELOW_PREFIX = "nest-below-";
