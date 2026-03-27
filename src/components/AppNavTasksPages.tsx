"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { SEGMENTED_ACTIVE } from "@/lib/segmentedControlStyles";

/** Matches board controls sizing; active state uses accent tint (stronger than inactive). */
const SEGMENT_BASE: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  padding: "8px 16px",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  boxSizing: "border-box",
  minHeight: 38,
  flex: "1 1 0",
  minWidth: 108,
};

const SEGMENT_BASE_COMPACT: CSSProperties = {
  ...SEGMENT_BASE,
  fontSize: 10,
  padding: "4px 8px",
  minHeight: 26,
  minWidth: 64,
};

export function AppNavTasksPages({
  active,
  compact = false,
}: {
  active: "tasks" | "pages";
  /** Narrow mobile header: smaller Tasks / Pages control. */
  compact?: boolean;
}) {
  const seg = compact ? SEGMENT_BASE_COMPACT : SEGMENT_BASE;
  return (
    <div
      role="navigation"
      aria-label="Main area"
      style={{
        display: "inline-flex",
        verticalAlign: "middle",
        maxWidth: "100%",
        borderRadius: 8,
        border: "1px solid var(--border-color)",
        overflow: "hidden",
      }}
    >
      {active === "tasks" ? (
        <span
          aria-current="page"
          style={{
            ...seg,
            ...SEGMENTED_ACTIVE,
            cursor: "default",
          }}
        >
          Tasks
        </span>
      ) : (
        <Link
          href="/"
          style={{
            ...seg,
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Tasks
        </Link>
      )}
      {active === "pages" ? (
        <span
          aria-current="page"
          style={{
            ...seg,
            ...SEGMENTED_ACTIVE,
            borderLeft: "1px solid var(--border-color)",
            cursor: "default",
          }}
        >
          Pages
        </span>
      ) : (
        <Link
          href="/pages"
          style={{
            ...seg,
            borderLeft: "1px solid var(--border-color)",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Pages
        </Link>
      )}
    </div>
  );
}
