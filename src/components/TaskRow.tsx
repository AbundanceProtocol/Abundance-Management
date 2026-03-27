"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskItem, SectionType } from "@/lib/types";
import {
  computeNextDueDate,
  formatYmd,
  parseDueDateTimeLocal,
  formatDueTimeDisplay,
  isRecurringCompletionActive,
} from "@/lib/recurrence";
import { getActiveTodayFocusYmd, msUntilNextTodayFocusReset } from "@/lib/todayFocus";
import { MAX_TASK_DEPTH } from "@/lib/constants";
import { formatTaskUrlLabel, normalizeTaskHref } from "@/lib/taskUrls";
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
  ZoomIn,
  MoreVertical,
  FileText,
} from "./Icons";

const COMPACT_TASK_ACTIONS_MQ = "(max-width: 768px)";

function useCompactTaskActions() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_TASK_ACTIONS_MQ);
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return compact;
}

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
  /** Used to apply recurring completion (advance due date + history). */
  sectionType?: SectionType;
  /** Subtract from stored depth when rendering (e.g. task zoom page). */
  depthIndentOffset?: number;
  /** Disable drag reorder (e.g. fixed root on zoom page). */
  sortableDisabled?: boolean;
  /** Show a small clock badge when task is selected for today's focus. */
  isTodayFocused?: boolean;
  /** When set, a category heading is shown above this row (first row of a group). */
  categoryGroupHeader?: string | null;
  /** Task zoom page list: tighter hierarchy + spacing on narrow viewports. */
  taskZoomList?: boolean;
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
  sectionType,
  depthIndentOffset = 0,
  sortableDisabled = false,
  isTodayFocused = false,
  categoryGroupHeader = null,
  taskZoomList = false,
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

  const compactActions = useCompactTaskActions();
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActionsMenuOpen(false);
  }, [task._id]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = actionsMenuRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setActionsMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actionsMenuOpen]);

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
    disabled: isDragOverlay || sortableDisabled,
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

  const indentStep =
    taskZoomList && compactActions ? 18 : 28;
  const rawIndent =
    Math.max(0, task.depth - depthIndentOffset) * indentStep;
  /**
   * Task zoom: subtract one nesting step from row padding so the list isn’t doubly
   * indented vs the page — keeps subtask rows where they were before the “full indent”
   * experiment. Main board: no change.
   */
  const indent =
    taskZoomList && rawIndent > 0
      ? Math.max(0, rawIndent - indentStep)
      : rawIndent;
  /** Zoom root task only: shift left by one step so it sits left of its subtasks without moving them. */
  const isZoomAnchorRow =
    taskZoomList && task.depth === depthIndentOffset;

  const showCategoryHeader =
    Boolean(categoryGroupHeader) && task.parentId === null;

  const recurringTempCompleteActive =
    sectionType === "recurring" &&
    isRecurringCompletionActive(task, new Date());
  const effectiveCompleted = task.completed || recurringTempCompleteActive;

  const hasDueDate = Boolean(task.dueDate?.trim());
  const showScheduleOrDueBadge =
    hasDueDate ||
    (sectionType === "recurring" && Boolean(task.dueTime?.trim()));
  const showScheduleOrDueBadgeVisible = !effectiveCompleted && showScheduleOrDueBadge;
  const dueAt = parseDueDateTimeLocal(task.dueDate, task.dueTime);
  const isOverdue =
    Boolean(dueAt) &&
    dueAt!.getTime() < Date.now() &&
    !effectiveCompleted;

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

  const dueDateLabel = (() => {
    if (task.dueDate?.trim()) {
      const base = formatDueDate(task.dueDate);
      const tm = formatDueTimeDisplay(task.dueTime);
      return tm ? `${base} · ${tm}` : base;
    }
    if (sectionType === "recurring" && task.dueTime?.trim()) {
      return formatDueTimeDisplay(task.dueTime);
    }
    return "";
  })();

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

  const canAddChildAction = task.depth - depthIndentOffset < MAX_TASK_DEPTH;
  const showZoomInActions = childCount > 0 && !task.hideSubtasksOnMainBoard;

  /** Task zoom page: anchor row is non-draggable; on narrow viewports hide grip + chevron for more title space. */
  const hideZoomAnchorMobileChrome = sortableDisabled && compactActions;
  /** Non-draggable row (e.g. zoom anchor, parent locked subtask drag): hide grip so touch UIs don’t show a dead handle. */
  const hideDragHandle = sortableDisabled;

  const narrowZoomMobile = taskZoomList && compactActions;
  /** Match completion circle (22px); center grip/chevron vertically in that strip. */
  const rowChromeSize = 22;
  const dragHandlePad = compactActions ? "0 1px 0 0" : 2;
  const chevronPad = compactActions ? "0 1px" : 2;

  function parseYmdLocal(s: string): Date {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const freq = task.repeatFrequency ?? "none";
    if (sectionType === "recurring" && freq !== "none") {
      // Toggle "occurrence complete" for this recurring instance.
      // We keep `task.completed=false` so recurring tasks stay on the main board,
      // but we use `recurringCompletionUntilIso` to keep the checkbox checked until 2am.
      if (effectiveCompleted) {
        onUpdate({
          _id: task._id,
          completed: false,
          recurringCompletionUntilIso: null,
        });
        return;
      }

      const completionYmd = getActiveTodayFocusYmd(new Date());
      const completionDate = parseYmdLocal(completionYmd);

      const ms = msUntilNextTodayFocusReset(new Date());
      const untilIso = new Date(Date.now() + Math.max(0, ms)).toISOString();

      const next = computeNextDueDate(task, completionDate);
      onUpdate({
        _id: task._id,
        completed: false,
        dueDate: next,
        completionHistory: [
          ...(task.completionHistory ?? []),
          completionYmd,
        ],
        recurringCompletionUntilIso: untilIso,
      });
      return;
    }

    onUpdate({
      _id: task._id,
      completed: !task.completed,
      recurringCompletionUntilIso: null,
    });
  };

  return (
    <div
      ref={setNodeRef}
      data-task-id={task._id}
      style={{
        ...style,
        marginLeft: isZoomAnchorRow ? -indentStep : 0,
        paddingLeft: indent,
      }}
      className={`task-row ${isSelected ? "task-row-selected" : ""} ${isDragOverlay ? "task-row-overlay" : ""}`}
    >
      {showCategoryHeader && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            padding: "2px 8px 6px",
            marginLeft: -indent,
            paddingLeft: 8 + indent,
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {categoryGroupHeader}
        </div>
      )}
        <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          borderRadius: 4,
          background: isSelected ? "var(--bg-active)" : "transparent",
          position: "relative",
        }}
        className={`task-row-inner${narrowZoomMobile ? " task-row-inner--task-zoom-narrow" : ""}${hideDragHandle ? " task-row-drag-disabled" : ""}`}
        onClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest("button")) return;
          if (el.closest("a")) return;
          if (el.closest("input")) return;
          if (el.closest("textarea")) return;
          onSelect();
        }}
      >
        {/* Drag handle — kept in DOM but invisible for anchor row so circles align */}
        <button
          type="button"
          title={hideDragHandle ? undefined : "Drag to reorder. Use the thin strip *below* a row: quick drop moves the task after it; hover that strip 2s then drop to nest inside it."}
          {...(hideDragHandle ? {} : { ...attributes, ...listeners })}
          tabIndex={hideDragHandle ? -1 : undefined}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: dragHandlePad,
            cursor: hideDragHandle ? "default" : "grab",
            touchAction: "none",
            opacity: 0,
            transition: "opacity 0.15s",
            flexShrink: 0,
            alignSelf: "flex-start",
            marginTop: "0.12em",
            height: rowChromeSize,
            minHeight: 0,
            minWidth: 0,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...(hideDragHandle
              ? { visibility: "hidden" as const, pointerEvents: "none" as const }
              : {}),
          }}
          className="drag-handle"
        >
          <GripVertical size={14} />
        </button>

        {/* Collapse toggle — kept in DOM but invisible for anchor row so circles align */}
        {childCount > 0 ? (
          <button
            onClick={(e) => {
              if (hideZoomAnchorMobileChrome) return;
              e.stopPropagation();
              onToggleCollapse();
            }}
            tabIndex={hideZoomAnchorMobileChrome ? -1 : undefined}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              padding: chevronPad,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "flex-start",
              marginTop: "0.12em",
              height: rowChromeSize,
              minHeight: 0,
              minWidth: 0,
              boxSizing: "border-box",
              ...(hideZoomAnchorMobileChrome
                ? { visibility: "hidden" as const, pointerEvents: "none" as const }
                : {}),
            }}
          >
            {task.collapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
        ) : (
          <button
            tabIndex={-1}
            style={{
              background: "none",
              border: "none",
              padding: chevronPad,
              flexShrink: 0,
              alignSelf: "flex-start",
              marginTop: "0.12em",
              height: rowChromeSize,
              minHeight: 0,
              minWidth: 0,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              visibility: "hidden",
              pointerEvents: "none",
            }}
            aria-hidden
          >
            <ChevronDown size={14} />
          </button>
        )}

        {/* Circle + text column: circle vertically aligned with first line of title */}
        <div className="task-row-circle-row">
            {/* Completion circle — sized to match title line, high contrast */}
              <button
                type="button"
                onClick={handleToggleComplete}
                className="task-row-checkbox"
                style={{
                  width: 22,
                  height: 22,
                  marginTop: "0.12em",
                  borderRadius: "50%",
                  border: `2.5px solid ${
                    effectiveCompleted
                      ? "var(--accent-green)"
                      : task.isCriticalPath
                        ? "var(--critical-path)"
                        : "var(--text-secondary)"
                  }`,
                  background: effectiveCompleted
                    ? "var(--accent-green)"
                    : "rgba(255, 255, 255, 0.06)",
                  boxShadow: effectiveCompleted
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
                title={effectiveCompleted ? "Mark incomplete" : "Mark complete"}
              >
                {effectiveCompleted && (
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
            {/* Title + zoom (grouped so zoom sits flush after text, not at row end) */}
            <div
              className="task-row-title-lead"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                flex: "1 1 auto",
              }}
            >
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
                  flex: "1 1 auto",
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
                  flex: "0 1 auto",
                  minWidth: 0,
                  maxWidth: "100%",
                  cursor: "pointer",
                  padding: "2px 4px",
                  textDecoration: effectiveCompleted ? "line-through" : "none",
                  color: effectiveCompleted ? "var(--text-muted)" : "var(--text-primary)",
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

            {!isEditing &&
              task.linkedPageId && (
                <button
                  type="button"
                  aria-label="Open linked page"
                  title="Open linked page"
                  onClick={(e) => {
                    e.stopPropagation();
                    const pageId = task.linkedPageId;
                    if (!pageId) return;
                    window.location.href = `/pages?pageId=${encodeURIComponent(
                      pageId
                    )}&taskId=${encodeURIComponent(task._id)}`;
                  }}
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(59, 130, 246, 0.18)",
                    border: "1px solid rgba(96, 165, 250, 0.45)",
                    color: "var(--accent-blue)",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <FileText size={14} />
                </button>
              )}

            {!isEditing &&
              sectionType === "recurring" &&
              task.recurringNotesPageId && (
                <button
                  type="button"
                  aria-label="Open daily notes page"
                  title="Open daily notes page"
                  onClick={(e) => {
                    e.stopPropagation();
                    const pageId = task.recurringNotesPageId;
                    if (!pageId) return;
                    window.location.href = `/pages?pageId=${encodeURIComponent(
                      pageId
                    )}&taskId=${encodeURIComponent(task._id)}`;
                  }}
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(59, 130, 246, 0.18)",
                    border: "1px solid rgba(96, 165, 250, 0.45)",
                    color: "var(--accent-blue)",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <FileText size={14} />
                </button>
              )}

            {!isEditing &&
              task.hideSubtasksOnMainBoard &&
              childCount > 0 && (
              <Link
                href={`/task/${task._id}`}
                onClick={(e) => e.stopPropagation()}
                className="task-row-zoom-chip"
                title="Open subtasks on their own page"
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4px 6px",
                  borderRadius: 6,
                  background: "rgba(59, 130, 246, 0.28)",
                  border: "1px solid rgba(96, 165, 250, 0.5)",
                  color: "rgb(96, 165, 250)",
                  textDecoration: "none",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <ZoomIn size={14} />
              </Link>
            )}
            </div>

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

              {isTodayFocused && (
                <span
                  style={{
                    color: "var(--accent-amber)",
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Today's focus"
                >
                  <Clock size={10} />
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

              {showScheduleOrDueBadgeVisible && (
                <span
                  style={{
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    color: isOverdue
                      ? "var(--accent-red)"
                      : hasDueDate && formatDueDate(task.dueDate!) === "Today"
                        ? "var(--accent-amber)"
                        : "var(--text-muted)",
                  }}
                >
                  <Calendar size={11} />
                  {dueDateLabel}
                </span>
              )}
            </div>

            {/* Action buttons: overflow menu on narrow viewports; inline on desktop */}
            {(() => {
              const showCompactActions = compactActions && !isDragOverlay;
              const menuItemStyle: React.CSSProperties = {
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                border: "none",
                borderRadius: 4,
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              };

              if (showCompactActions) {
                return (
                  <div
                    ref={actionsMenuRef}
                    className="task-actions-mobile-wrap"
                    style={{
                      position: "relative",
                      flexShrink: 0,
                      marginLeft: "auto",
                      alignSelf: "center",
                    }}
                  >
                    <button
                      type="button"
                      className="task-actions-menu-trigger"
                      aria-expanded={actionsMenuOpen}
                      aria-haspopup="menu"
                      aria-label="Task actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionsMenuOpen((v) => !v);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        padding: 6,
                        borderRadius: 3,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Task actions"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {actionsMenuOpen && (
                      <div
                        role="menu"
                        className="task-actions-menu-panel"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "100%",
                          marginTop: 4,
                          zIndex: 60,
                          minWidth: 188,
                          padding: 4,
                          borderRadius: 8,
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionsMenuOpen(false);
                            onSelect();
                          }}
                          style={menuItemStyle}
                        >
                          <Comment size={14} />
                          Details
                        </button>
                        {showZoomInActions && (
                          <Link
                            href={`/task/${task._id}`}
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionsMenuOpen(false);
                            }}
                            title="Open subtasks on their own page"
                            style={{
                              ...menuItemStyle,
                              textDecoration: "none",
                              color: "var(--text-primary)",
                            }}
                          >
                            <ZoomIn size={14} />
                            Subtasks page
                          </Link>
                        )}
                        {canAddChildAction && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionsMenuOpen(false);
                              onAddChild();
                            }}
                            style={menuItemStyle}
                          >
                            <Plus size={14} />
                            Add sub-task
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionsMenuOpen(false);
                            onDelete(task._id);
                          }}
                          style={{
                            ...menuItemStyle,
                            color: "var(--accent-red)",
                          }}
                        >
                          <Trash size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              return (
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
                  {showZoomInActions && (
                    <Link
                      href={`/task/${task._id}`}
                      onClick={(e) => e.stopPropagation()}
                      title="Open subtasks on their own page"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: 4,
                        borderRadius: 3,
                        color: "var(--text-muted)",
                      }}
                    >
                      <ZoomIn size={14} />
                    </Link>
                  )}
                  {canAddChildAction && (
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
              );
            })()}
          </div>

          {(task.urls ?? []).filter((u) => u.trim()).length > 0 && (
            <div className="task-row-link-wrap task-row-links">
              {(task.urls ?? [])
                .filter((u) => u.trim())
                .map((u, i) => (
                  <a
                    key={`${task._id}-link-${i}-${u.slice(0, 24)}`}
                    href={normalizeTaskHref(u)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="task-row-link"
                    title={u.trim()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatTaskUrlLabel(u)}
                  </a>
                ))}
            </div>
          )}

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
