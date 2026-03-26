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

export function AppNavTasksPages({
  active,
}: {
  active: "tasks" | "pages";
}) {
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
            ...SEGMENT_BASE,
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
            ...SEGMENT_BASE,
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
            ...SEGMENT_BASE,
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
            ...SEGMENT_BASE,
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
