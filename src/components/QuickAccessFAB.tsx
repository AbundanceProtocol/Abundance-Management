"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useViewportNarrow } from "../lib/useViewportNarrow";
import type { TaskItem } from "../lib/types";
import { Calendar, ChevronDown, ClipboardList, FileText, MindMap } from "./Icons";

const NAV_LINKS = [
  { key: "tasks", label: "Tasks", href: "/", icon: <ClipboardList size={14} /> },
  { key: "pages", label: "Pages", href: "/pages", icon: <FileText size={14} /> },
  { key: "mind-maps", label: "Mind Maps", href: "/mind-maps", icon: <MindMap size={14} /> },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: <Calendar size={14} /> },
] as const;

// ─── Activity scoring ──────────────────────────────────────────────────────────

function getDescendants(allTasks: TaskItem[], parentId: string): TaskItem[] {
  const children = allTasks.filter((t) => t.parentId === parentId);
  return children.flatMap((c) => [c, ...getDescendants(allTasks, c._id)]);
}

/**
 * Returns the top 5 root tasks ranked by most-recent subtask activity
 * (adding or completing a subtask bumps the score via updatedAt / createdAt).
 */
function computeTopTasks(allTasks: TaskItem[]): TaskItem[] {
  const roots = allTasks.filter(
    (t) => t.parentId === null && !t.completed && !t.mindMapOnly
  );

  const scored = roots
    .map((root) => {
      const descendants = getDescendants(allTasks, root._id);
      if (descendants.length === 0) return { root, score: 0 };
      const score = Math.max(
        ...descendants.map((d) =>
          Math.max(
            new Date(d.updatedAt).getTime(),
            new Date(d.createdAt).getTime()
          )
        )
      );
      return { root, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map((x) => x.root);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function QuickAccessFAB() {
  const isNarrow = useViewportNarrow();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view") ?? "all";
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  // Touch tracking for swipe-up gesture on the FAB pill
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTasks(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const topTasks = computeTopTasks(tasks);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (dy > 20) setOpen(true); // swipe up
    touchStartY.current = null;
  }, []);

  const handleNavigate = useCallback(
    (taskId: string) => {
      setOpen(false);
      router.push(`/task/${taskId}`);
    },
    [router]
  );

  // Only show on mobile and when there are active tasks with subtask activity
  if (!isNarrow || topTasks.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 890,
          }}
        />
      )}

      {/* Bottom sheet — slides up from the bottom */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 891,
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          background: "var(--bg-primary)",
          borderTop: "1px solid var(--border-color)",
          boxShadow: "0 -6px 32px rgba(0,0,0,0.28)",
        }}
      >
        {/* Sheet header */}
        <div
          style={{
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {/* Nav strip */}
          <div style={{ display: "flex" }}>
            {NAV_LINKS.map((nav, i) => (
              <Link
                key={nav.key}
                href={nav.href}
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "10px 4px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  textDecoration: "none",
                  borderLeft: i > 0 ? "1px solid var(--border-color)" : "none",
                }}
              >
                <span style={{ display: "inline-flex" }}>{nav.icon}</span>
                {nav.label}
              </Link>
            ))}
          </div>

          {/* Section type shortcuts */}
          <div style={{ display: "flex", borderTop: "1px solid var(--border-color)" }}>
            {(
              [
                { view: "project", label: "Project" },
                { view: "recurring", label: "Recurring" },
                { view: "todo", label: "To-do" },
              ] as const
            ).map((opt, i) => (
              <Link
                key={opt.view}
                href={`/?view=${opt.view}`}
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 11,
                  fontWeight: activeView === opt.view ? 700 : 500,
                  color: activeView === opt.view ? "var(--accent-blue)" : "var(--text-muted)",
                  textDecoration: "none",
                  textAlign: "center",
                  borderLeft: i > 0 ? "1px solid var(--border-color)" : "none",
                  background: activeView === opt.view ? "var(--bg-secondary)" : "transparent",
                }}
              >
                {opt.label}
              </Link>
            ))}
          </div>

          {/* Section label */}
          <div
            style={{
              padding: "8px 16px 10px",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Quick Access
            </span>
          </div>
        </div>

        {/* Task list */}
        <div style={{ padding: "6px 0 32px" }}>
          {topTasks.map((task, i) => (
            <button
              key={task._id}
              type="button"
              onClick={() => handleNavigate(task._id)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "11px 16px",
                background: "none",
                border: "none",
                borderBottom:
                  i < topTasks.length - 1
                    ? "1px solid var(--border-color)"
                    : "none",
                color: "var(--text-primary)",
                textAlign: "left",
                fontSize: 14,
                cursor: "pointer",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--accent-blue)",
                  width: 18,
                  flexShrink: 0,
                  textAlign: "center",
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {task.title || "(Untitled)"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* FAB pill — always visible in bottom-right, opens the sheet */}
      <button
        type="button"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick access — top active tasks"
        style={{
          position: "fixed",
          bottom: 20,
          right: 16,
          zIndex: 892,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 12px",
          borderRadius: 999,
          border: "1px solid var(--border-color)",
          background: "var(--accent-blue)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
          transition: "transform 0.15s",
          userSelect: "none",
          // Shift up when the sheet is open so the FAB isn't under it
          transform: open ? "translateY(-8px)" : "translateY(0)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            transform: open ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform 0.25s",
          }}
        >
          <ChevronDown size={15} />
        </span>
      </button>
    </>
  );
}
