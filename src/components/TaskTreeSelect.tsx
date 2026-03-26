"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "./Icons";
import type { Section } from "@/lib/types";
import type { TaskItem } from "@/lib/types";

const INDENT_PX = 14;
const BASE_PAD = 8;
const TRIGGER_MIN_WIDTH = 260;
const TRIGGER_MAX_WIDTH = 380;

type TaskTreeSelectProps = {
  tasks: TaskItem[];
  sections: Section[];
  value: string;
  onChange: (taskId: string) => void;
  /** When set, indents are relative to this root (page linked to subtree). */
  pageRootTaskId: string | null;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  /** Narrow toolbars: allow trigger to shrink so labels are less clipped. */
  compact?: boolean;
};

function indentPadding(task: TaskItem, pageRootTaskId: string | null, rootDepth: number): number {
  if (pageRootTaskId) {
    return BASE_PAD + Math.max(0, task.depth - rootDepth) * INDENT_PX;
  }
  return BASE_PAD + task.depth * INDENT_PX;
}

export default function TaskTreeSelect({
  tasks,
  sections,
  value,
  onChange,
  pageRootTaskId,
  placeholder = "Choose task",
  disabled,
  title,
  compact = false,
}: TaskTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const rootDepth =
    pageRootTaskId && tasks.length > 0
      ? tasks.find((t) => t._id === pageRootTaskId)?.depth ?? 0
      : 0;

  const selected = tasks.find((t) => t._id === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const wrap = wrapRef.current;
    if (!panel || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const maxH = Math.min(420, Math.max(180, spaceBelow - 12));
    panel.style.maxHeight = `${maxH}px`;
  }, [open]);

  const label = selected?.title?.trim() || placeholder;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        minWidth: compact ? 0 : TRIGGER_MIN_WIDTH,
        maxWidth: compact ? "100%" : TRIGGER_MAX_WIDTH,
        flex: compact ? "1 1 100%" : "1 1 auto",
      }}
    >
      <button
        type="button"
        disabled={disabled || tasks.length === 0}
        title={title}
        onClick={() => !disabled && tasks.length > 0 && setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          minWidth: compact ? 0 : TRIGGER_MIN_WIDTH,
          maxWidth: compact ? "100%" : TRIGGER_MAX_WIDTH,
          fontSize: 11,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--border-color)",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          cursor: disabled || tasks.length === 0 ? "not-allowed" : "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tasks.length === 0 ? "No tasks" : label}
        </span>
        <span style={{ flexShrink: 0, opacity: 0.7, display: "inline-flex" }}>
          <ChevronDown size={14} />
        </span>
      </button>

      {open && tasks.length > 0 && (
        <div
          ref={panelRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 50,
            marginTop: 4,
            overflow: "auto",
            overflowX: "hidden",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg-primary)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            width: "min(440px, calc(100vw - 24px))",
            minWidth: "min(280px, calc(100vw - 24px))",
            boxSizing: "border-box",
          }}
        >
          {tasks.map((t, i) => {
            const prev = i > 0 ? tasks[i - 1] : null;
            const showSectionHeader = Boolean(
              !pageRootTaskId && (!prev || prev.sectionId !== t.sectionId)
            );
            const sec = sections.find((s) => s._id === t.sectionId);
            const pad = indentPadding(t, pageRootTaskId, rootDepth);

            return (
              <React.Fragment key={t._id}>
                {showSectionHeader && sec && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      padding: "8px 10px 4px",
                      borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none",
                    }}
                  >
                    {sec.title}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange(t._id);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontSize: 12,
                    padding: `6px 10px 6px ${pad}px`,
                    border: "none",
                    borderLeft:
                      value === t._id ? "3px solid var(--accent-blue)" : "3px solid transparent",
                    background: value === t._id ? "rgba(59,130,246,0.12)" : "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                  }}
                >
                  {t.title.trim() || "Untitled"}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
