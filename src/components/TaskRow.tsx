"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskItem } from "@/lib/types";
import { MAX_TASK_DEPTH } from "@/lib/constants";
import {
  ChevronRight,
  ChevronDown,
  GripVertical,
  Plus,
  Trash,
  Comment,
  Flag,
  Clock,
  Calendar,
  ArrowDownRight,
} from "./Icons";

interface Props {
  task: TaskItem;
  childCount: number;
  onUpdate: (task: Partial<TaskItem> & { _id: string }) => void;
  onDelete: (id: string) => void;
  onAddChild: () => void;
  /** Press Enter in title field: save and add sibling below */
  onCreateSiblingAfter?: () => void | Promise<void>;
  onToggleCollapse: () => void;
  onSelect: () => void;
  isSelected: boolean;
  isDragOverlay?: boolean;
  /** For root tasks: sequential arrow comes from the section (top-level list order). */
  sectionSequentialForRoot?: boolean;
}

export default function TaskRow({
  task,
  childCount,
  onUpdate,
  onDelete,
  onAddChild,
  onCreateSiblingAfter,
  onToggleCollapse,
  onSelect,
  isSelected,
  isDragOverlay = false,
  sectionSequentialForRoot,
}: Props) {
  const [isEditing, setIsEditing] = useState(!task.title);
  const [editValue, setEditValue] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Avoid duplicate save when Enter blurs the input */
  const skipBlurCommitRef = useRef(false);

  const notesRef = useRef<HTMLParagraphElement>(null);
  const notesExpandedRef = useRef(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesOverflow, setNotesOverflow] = useState(false);
  notesExpandedRef.current = notesExpanded;

  useEffect(() => {
    setNotesExpanded(false);
  }, [task._id, task.notes]);

  useLayoutEffect(() => {
    const el = notesRef.current;
    if (!el || notesExpanded) return;

    const measure = () => {
      const p = notesRef.current;
      if (!p || notesExpandedRef.current) return;
      setNotesOverflow(p.scrollHeight > p.clientHeight + 1);
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [task.notes, notesExpanded]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task._id,
    data: { task },
    disabled: isDragOverlay,
  });

  const showSequentialArrow =
    task.parentId === null
      ? (sectionSequentialForRoot ?? false)
      : task.isSequential;

  const style = isDragOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const commitEdit = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    setIsEditing(false);
    if (editValue.trim() !== task.title) {
      onUpdate({ _id: task._id, title: editValue.trim() });
    }
    if (!editValue.trim() && !task.title) {
      onDelete(task._id);
    }
  };

  const indent = task.depth * 28;

  const hasDueDate = task.dueDate;
  const isOverdue =
    hasDueDate && new Date(task.dueDate!) < new Date() && !task.completed;

  const formatDueDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff < 0) return `${Math.abs(Math.floor(diff))}d overdue`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatTime = (est: number, unit: string) => {
    return `${est}${unit.charAt(0)}`;
  };

  const pr = task.priority ?? "medium";
  const priorityLabel = pr === "high" ? "H" : pr === "low" ? "L" : "M";
  const priorityTitle =
    pr === "high" ? "High priority" : pr === "low" ? "Low priority" : "Medium priority";
  const priorityColors =
    pr === "high"
      ? { background: "rgba(248,113,113,0.18)", color: "#f87171" }
      : pr === "low"
        ? { background: "var(--bg-tertiary)", color: "var(--text-muted)" }
        : { background: "rgba(251,191,36,0.12)", color: "var(--accent-amber)" };

  return (
    <div
      ref={setNodeRef}
      data-task-id={task._id}
      style={{
        ...style,
        paddingLeft: indent,
      }}
      className={`task-row ${isSelected ? "task-row-selected" : ""} ${isDragOverlay ? "task-row-overlay" : ""}`}
    >
        <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          borderRadius: 4,
          background: isSelected ? "var(--bg-active)" : "transparent",
          position: "relative",
        }}
        className="task-row-inner"
        onClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest("button")) return;
          if (el.closest("a")) return;
          if (el.closest("input")) return;
          if (el.closest("textarea")) return;
          onSelect();
        }}
      >
        {/* Drag handle */}
        <button
          type="button"
          title="Drag to reorder. Use the thin strip *below* a row: quick drop moves the task after it; hover that strip 2s then drop to nest inside it."
          {...attributes}
          {...listeners}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: 2,
            cursor: "grab",
            opacity: 0,
            transition: "opacity 0.15s",
            flexShrink: 0,
            alignSelf: "flex-start",
            marginTop: "0.12em",
          }}
          className="drag-handle"
        >
          <GripVertical size={14} />
        </button>

        {/* Collapse toggle */}
        {childCount > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                padding: 2,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                alignSelf: "flex-start",
                marginTop: "0.12em",
              }}
            >
              {task.collapsed ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
        ) : (
          <span
            style={{
              width: 18,
              flexShrink: 0,
              alignSelf: "flex-start",
              marginTop: "0.12em",
            }}
          />
        )}

        {/* Circle + text column: circle vertically aligned with first line of title */}
        <div className="task-row-circle-row">
            {/* Completion circle — sized to match title line, high contrast */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ _id: task._id, completed: !task.completed });
                }}
                className="task-row-checkbox"
                style={{
                  width: 22,
                  height: 22,
                  marginTop: "0.12em",
                  borderRadius: "50%",
                  border: `2.5px solid ${
                    task.completed
                      ? "var(--accent-green)"
                      : task.isCriticalPath
                        ? "var(--critical-path)"
                        : "var(--text-secondary)"
                  }`,
                  background: task.completed
                    ? "var(--accent-green)"
                    : "rgba(255, 255, 255, 0.06)",
                  boxShadow: task.completed
                    ? "none"
                    : "inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
                  flexShrink: 0,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                }}
                title={task.completed ? "Mark incomplete" : "Mark complete"}
              >
                {task.completed && (
                  <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5l2.5 2.5L8 3"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>

            <div className="task-row-text-stack">
              <div className="task-row-title-row">
            {/* Title */}
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    skipBlurCommitRef.current = true;
                    const trimmed = editValue.trim();
                    if (!trimmed && !task.title) {
                      onDelete(task._id);
                      return;
                    }
                    setIsEditing(false);
                    if (trimmed !== task.title) {
                      onUpdate({ _id: task._id, title: trimmed });
                    }
                    if (onCreateSiblingAfter) {
                      await onCreateSiblingAfter();
                    }
                    return;
                  }
                  if (e.key === "Escape") {
                    setEditValue(task.title);
                    setIsEditing(false);
                  }
                }}
                className="task-row-title-input"
                style={{
                  flex: "1 1 140px",
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  outline: "none",
                  padding: "2px 4px",
                  fontWeight: 600,
                }}
                placeholder="Task name..."
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setEditValue(task.title);
                }}
                className="task-row-title"
                style={{
                  flex: "1 1 140px",
                  minWidth: 0,
                  cursor: "text",
                  padding: "2px 4px",
                  textDecoration: task.completed ? "line-through" : "none",
                  color: task.completed ? "var(--text-muted)" : "var(--text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: 600,
                }}
              >
                {task.title || (
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontWeight: 600 }}>
                    Untitled
                  </span>
                )}
              </span>
            )}

            {/* Inline badges (nowrap + horizontal scroll on narrow screens — see globals.css) */}
            <div
              className="task-row-title-meta"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 3,
                  letterSpacing: "0.02em",
                  ...priorityColors,
                }}
                title={priorityTitle}
              >
                {priorityLabel}
              </span>

              {task.isCriticalPath && (
                <span
                  style={{
                    color: "var(--critical-path)",
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Critical Path"
                >
                  <Flag size={13} />
                </span>
              )}

              {showSequentialArrow && (
                <span
                  style={{
                    color: "var(--accent-blue)",
                    display: "flex",
                    alignItems: "center",
                  }}
                  title={
                    task.parentId === null
                      ? "Sequential (section: top-level order)"
                      : "Sequential (children in order)"
                  }
                >
                  <ArrowDownRight size={13} />
                </span>
              )}

              {task.timeEstimate && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Clock size={11} />
                  {formatTime(task.timeEstimate, task.timeUnit)}
                </span>
              )}

              {task.tags?.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 11,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: "var(--tag-bg)",
                    color: "var(--tag-text)",
                  }}
                >
                  {tag}
                </span>
              ))}

              {hasDueDate && (
                <span
                  style={{
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    color: isOverdue
                      ? "var(--accent-red)"
                      : formatDueDate(task.dueDate!) === "Today"
                        ? "var(--accent-amber)"
                        : "var(--text-muted)",
                  }}
                >
                  <Calendar size={11} />
                  {formatDueDate(task.dueDate!)}
                </span>
              )}

              {task.url && (
                <a
                  href={task.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--accent-blue)",
                    display: "flex",
                    alignItems: "center",
                  }}
                  title={task.url}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M6.5 9.5a3 3 0 004.24 0l1.5-1.5a3 3 0 00-4.24-4.24L7 4.76" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M9.5 6.5a3 3 0 00-4.24 0L3.76 8a3 3 0 004.24 4.24L9 11.24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </a>
              )}
            </div>

            {/* Action buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                opacity: 0,
                transition: "opacity 0.15s",
                flexShrink: 0,
                marginLeft: "auto",
              }}
              className="task-actions"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  padding: 4,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                }}
                title="Details"
              >
                <Comment size={14} />
              </button>
              {task.depth < MAX_TASK_DEPTH && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    padding: 4,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Add sub-task"
                >
                  <Plus size={14} />
                </button>
              )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task._id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    padding: 4,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Delete"
                >
                  <Trash size={14} />
                </button>
            </div>
          </div>

          {/* Notes under the title row */}
          {task.notes?.trim() && (
            <div className="task-row-notes-wrap">
              <p
                ref={notesRef}
                className={
                  notesExpanded
                    ? "task-row-notes"
                    : "task-row-notes task-row-notes-clamp"
                }
                style={{
                  margin: 0,
                  color: "var(--text-muted)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {task.notes.trim()}
              </p>
              {(notesOverflow || notesExpanded) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotesExpanded((v) => !v);
                  }}
                  className="task-row-notes-toggle"
                  style={{
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--accent-blue)",
                  }}
                >
                  {notesExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
