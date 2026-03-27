"use client";

import Link from "next/link";
import type { TasksViewFilter } from "@/lib/tasksViewFilter";
import { SEGMENTED_ACTIVE, SEGMENTED_INACTIVE } from "@/lib/segmentedControlStyles";

const VIEWS: { id: TasksViewFilter; label: string; title: string }[] = [
  { id: "all", label: "All", title: "All section types" },
  {
    id: "recurring",
    label: "Recurring",
    title: "Recurring tasks & habits",
  },
  { id: "todo", label: "To-do", title: "To-do list sections" },
  {
    id: "project",
    label: "Projects",
    title: "Project sections (critical path, Gantt)",
  },
];

function hrefForView(id: TasksViewFilter): string {
  return id === "all" ? "/" : `/?view=${id}`;
}

export default function TaskViewNav({
  active,
  compact = false,
}: {
  active: TasksViewFilter;
  compact?: boolean;
}) {
  const fs = compact ? 10 : 13;
  const pad = compact ? "4px 6px" : "6px 12px";

  return (
    <div
      role="navigation"
      aria-label="Task board scope"
      style={{
        display: "flex",
        flexWrap: "wrap",
        borderRadius: 8,
        border: "1px solid var(--border-color)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      {VIEWS.map((v, i) => {
        const on = active === v.id;
        return (
          <Link
            key={v.id}
            href={hrefForView(v.id)}
            scroll={false}
            title={v.title}
            aria-current={on ? "page" : undefined}
            style={{
              fontSize: fs,
              padding: pad,
              border: "none",
              borderLeft: i > 0 ? "1px solid var(--border-color)" : "none",
              textDecoration: "none",
              textAlign: "center",
              flex: "1 1 auto",
              minWidth: 0,
              cursor: "pointer",
              ...(on ? SEGMENTED_ACTIVE : SEGMENTED_INACTIVE),
            }}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
