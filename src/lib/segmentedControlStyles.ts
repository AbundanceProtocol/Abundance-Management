import type { CSSProperties } from "react";

/** Active option inside a bordered segmented control (Tasks/Pages, board layout mode, etc.). */
export const SEGMENTED_ACTIVE: CSSProperties = {
  background: "rgba(75, 156, 245, 0.22)",
  color: "var(--accent-blue)",
  fontWeight: 600,
  boxShadow: "inset 0 0 0 1px rgba(75, 156, 245, 0.45)",
};

export const SEGMENTED_INACTIVE: CSSProperties = {
  background: "transparent",
  color: "var(--text-secondary)",
  fontWeight: 500,
};
