"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  TaskItem,
  TimeUnit,
  TaskPriority,
  Section,
  SectionType,
  RepeatFrequency,
} from "@/lib/types";
import {
  computeNestMove,
  computeReparentToParent,
  isUnderTask,
  type ReorderItem,
} from "@/lib/dndReorder";
import { coerceTopLevelSort, flattenTasksTree } from "@/lib/timelineUtils";
import { MAX_TASK_DEPTH } from "@/lib/constants";
import type { MarkdownPageItem, PagesEnvironment } from "@/lib/pagesTypes";
import { emptyPageDocument, serializePageDocument } from "@/lib/pageDocument";
import {
  Clock,
  Calendar,
  Flag,
  Link,
  FileText,
  ArrowDownRight,
  ZoomIn,
} from "./Icons";
import { getActiveTodayFocusYmd, msUntilNextTodayFocusReset } from "@/lib/todayFocus";

interface Props {
  task: TaskItem;
  /** Section for the task (recurrence UI only in recurring section). */
  section: Section | null;
  onUpdate: (task: Partial<TaskItem> & { _id: string }) => void;
  onClose: () => void;
  /** Direct children count; used to show “subtasks on board” control. */
  directChildCount: number;
  /** Duplicate this task and its subtree as siblings below; optional. */
  onDuplicate?: () => void | Promise<void>;
  duplicateBusy?: boolean;
  /** All tasks (for parent picker & reparent). */
  tasks?: TaskItem[];
  reorderTasks?: (updates: ReorderItem[]) => Promise<void>;
  createTask?: (
    sectionId: string,
    parentId: string | null,
    depth: number,
    sectionType?: SectionType
  ) => Promise<TaskItem>;
  /** Open a task after creating a subtask (e.g. select in panel). */
  onNavigateToTask?: (taskId: string) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Labels for tree `<option>`s: native selects collapse normal spaces — use em space + branch glyph. */
function formatTaskTreeOptionLabel(t: TaskItem): string {
  const title = t.title.trim() || "Untitled";
  const d = Math.min(t.depth ?? 0, 32);
  const indent = "\u2003".repeat(d);
  const branch = d > 0 ? "\u21B3\u00A0" : "";
  return `${indent}${branch}${title}`;
}

export default function TaskDetailPanel({
  task,
  section,
  onUpdate,
  onClose,
  directChildCount,
  onDuplicate,
  duplicateBusy = false,
  tasks,
  reorderTasks,
  createTask,
  onNavigateToTask,
}: Props) {
  const [activeTodayFocusYmd, setActiveTodayFocusYmd] = useState(() =>
    getActiveTodayFocusYmd()
  );
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [urls, setUrls] = useState<string[]>(() => [...(task.urls ?? [])]);
  const [timeEstimate, setTimeEstimate] = useState<string>(
    task.timeEstimate?.toString() || ""
  );
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(task.timeUnit);
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? "medium");
  const [startDate, setStartDate] = useState(task.startDate || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [dueTime, setDueTime] = useState(() =>
    task.dueTime?.trim() ? task.dueTime : ""
  );
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>(
    task.repeatFrequency ?? "none"
  );
  const [linkedPageId, setLinkedPageId] = useState(task.linkedPageId ?? "");
  const [pages, setPages] = useState<MarkdownPageItem[]>([]);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(
    () => task.repeatWeekdays?.length ? [...task.repeatWeekdays] : [new Date().getDay()]
  );
  const [category, setCategory] = useState(() => (task.category ?? "").trim());
  const [reparentBusy, setReparentBusy] = useState(false);
  const [createSubtaskBusy, setCreateSubtaskBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [creatingLinkedPage, setCreatingLinkedPage] = useState(false);

  const sectionTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.sectionId === task.sectionId),
    [tasks, task.sectionId]
  );

  const sectionTopSort = useMemo(
    () => coerceTopLevelSort(section?.topLevelSort ?? "manual"),
    [section?.topLevelSort]
  );

  /** Same depth-first order as the board (sibling order from section sort). */
  const flatSectionTree = useMemo(
    () => flattenTasksTree(sectionTasks, sectionTopSort),
    [sectionTasks, sectionTopSort]
  );

  const validParentOptions = useMemo(() => {
    if (!tasks || !section) return [];
    const validIds = new Set(
      sectionTasks
        .filter(
          (t) =>
            t._id !== task._id &&
            !isUnderTask(tasks, t._id, task._id) &&
            t.depth < MAX_TASK_DEPTH
        )
        .map((t) => t._id)
    );
    return flatSectionTree.filter((t) => validIds.has(t._id));
  }, [tasks, section, sectionTasks, flatSectionTree, task]);

  const canNestChildrenUnder = task.depth < MAX_TASK_DEPTH;

  /** Tasks that can be moved to become a (last) child of this task. */
  const attachableSubtaskOptions = useMemo(() => {
    if (!tasks || !section || !canNestChildrenUnder) return [];
    return flatSectionTree.filter((t) => {
      if (t._id === task._id) return false;
      const updates = computeNestMove(tasks, t, task);
      return updates !== null;
    });
  }, [tasks, section, flatSectionTree, task, canNestChildrenUnder]);

  const canAddSubtask =
    Boolean(section && createTask) && task.depth < MAX_TASK_DEPTH;

  const persistPartial = useCallback(
    (partial: Partial<TaskItem>) => {
      onUpdate({ _id: task._id, ...partial });
    },
    [onUpdate, task._id]
  );

  const handleParentSelect = useCallback(
    (newParentId: string | null) => {
      if (!tasks || !reorderTasks) return;
      const updates = computeReparentToParent(tasks, task, newParentId);
      if (!updates?.length) return;
      setReparentBusy(true);
      void reorderTasks(updates).finally(() => setReparentBusy(false));
    },
    [tasks, reorderTasks, task]
  );

  const handleCreateNewSubtask = useCallback(async () => {
    if (!section || !createTask || !canAddSubtask) return;
    setCreateSubtaskBusy(true);
    try {
      const created = await createTask(
        section._id,
        task._id,
        task.depth + 1,
        section.type
      );
      if (task.collapsed) {
        persistPartial({ collapsed: false });
      }
      onNavigateToTask?.(created._id);
    } finally {
      setCreateSubtaskBusy(false);
    }
  }, [
    section,
    createTask,
    canAddSubtask,
    task,
    task.depth,
    task.collapsed,
    onNavigateToTask,
    persistPartial,
  ]);

  const handleAttachExistingAsSubtask = useCallback(
    (childId: string) => {
      if (!tasks || !reorderTasks || !childId) return;
      const child = tasks.find((t) => t._id === childId);
      if (!child) return;
      const updates = computeNestMove(tasks, child, task);
      if (!updates?.length) return;
      setAttachBusy(true);
      void reorderTasks(updates).finally(() => setAttachBusy(false));
    },
    [tasks, reorderTasks, task]
  );

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
    setUrls([...(task.urls ?? [])]);
    setTimeEstimate(task.timeEstimate?.toString() || "");
    setTimeUnit(task.timeUnit);
    setPriority(task.priority ?? "medium");
    setStartDate(task.startDate || "");
    setDueDate(task.dueDate || "");
    setLinkedPageId(task.linkedPageId ?? "");
    setRepeatFrequency(task.repeatFrequency ?? "none");
    setRepeatWeekdays(
      task.repeatWeekdays?.length ? [...task.repeatWeekdays] : [new Date().getDay()]
    );
    setCategory((task.category ?? "").trim());
  }, [task]);

  useEffect(() => {
    let cancelled = false;
    const schedule = () => {
      const ms = msUntilNextTodayFocusReset(new Date());
      const t = window.setTimeout(() => {
        if (cancelled) return;
        setActiveTodayFocusYmd(getActiveTodayFocusYmd(new Date()));
        schedule();
      }, Math.max(0, ms));
      return t;
    };
    const t = schedule();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, []);

  const isTodayFocused = task.todayFocusDate === activeTodayFocusYmd;

  useEffect(() => {
    let mounted = true;
    const loadPages = async () => {
      try {
        const res = await fetch("/api/pages");
        const data = (await res.json()) as PagesEnvironment;
        if (!mounted) return;
        setPages(data?.items ?? []);
      } catch {
        if (mounted) setPages([]);
      }
    };
    void loadPages();
    return () => {
      mounted = false;
    };
  }, []);

  const syncPageRootTask = async (pageId: string, taskId: string) => {
    try {
      const res = await fetch("/api/pages");
      const data = (await res.json()) as PagesEnvironment;
      const items = (data?.items ?? []).map((p) =>
        p.id === pageId ? { ...p, linkedTaskId: taskId } : p
      );
      await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    } catch {
      // non-fatal
    }
  };

  const createAndLinkNewRootPage = useCallback(async () => {
    if (creatingLinkedPage) return;
    setCreatingLinkedPage(true);
    try {
      const res = await fetch("/api/pages");
      const data = (await res.json()) as PagesEnvironment;
      const items = data?.items ?? [];
      const siblings = items.filter((p) => (p.parentId ?? null) === null);

      const pageId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const page: MarkdownPageItem = {
        id: pageId,
        title: "New page",
        body: serializePageDocument(emptyPageDocument()),
        linkedTaskId: task._id,
        parentId: null,
        depth: 0,
        order: siblings.length,
      };

      const nextEnv: PagesEnvironment = { items: [...items, page] };
      await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextEnv),
      });

      setPages(nextEnv.items);
      setLinkedPageId(page.id);
      persistPartial({ linkedPageId: page.id });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to create page");
    } finally {
      setCreatingLinkedPage(false);
    }
  }, [creatingLinkedPage, persistPartial, task._id]);

  const commitUrls = () => {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    const prev = (task.urls ?? []).map((u) => u.trim()).filter(Boolean);
    const same =
      cleaned.length === prev.length &&
      cleaned.every((u, i) => u === prev[i]);
    if (!same) persistPartial({ urls: cleaned });
    setUrls(cleaned);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 380,
        height: "100vh",
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Task Details</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={title.trim() || "Untitled"}
          >
            {title.trim() || "Untitled"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 18,
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Title */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const next = title.trim();
              if (next !== (task.title || "").trim()) {
                persistPartial({ title: next });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Task name..."
            style={{
              width: "100%",
              fontSize: 15,
              fontWeight: 600,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Category */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Category
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onBlur={() => {
              const next = category.trim();
              const prev = (task.category ?? "").trim();
              if (next !== prev) persistPartial({ category: next });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="e.g. Work, Personal"
            style={{
              width: "100%",
              fontSize: 14,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
            }}
          />
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              margin: "6px 0 0",
              lineHeight: 1.4,
            }}
          >
            Use “Group by category” in the section header to show headings and group
            tasks.
          </p>
        </div>

        {tasks && reorderTasks && section && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Parent task
            </label>
            <select
              disabled={reparentBusy}
              value={task.parentId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                handleParentSelect(v === "" ? null : v);
              }}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                cursor: reparentBusy ? "wait" : "pointer",
                boxSizing: "border-box",
              }}
            >
              <option value="">Top level (section root)</option>
              {validParentOptions.map((t) => (
                <option key={t._id} value={t._id}>
                  {formatTaskTreeOptionLabel(t)}
                </option>
              ))}
            </select>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "6px 0 0",
                lineHeight: 1.4,
              }}
            >
              Make this task a subtask of another task in the same section. Your
              subtasks move with you.
            </p>
          </div>
        )}

        {section && tasks && reorderTasks && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Subtasks
            </label>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 4,
              }}
            >
              Attach existing task
            </label>
            <select
              key={`attach-subtask-${task._id}`}
              aria-busy={attachBusy}
              disabled={attachBusy || !canNestChildrenUnder}
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) handleAttachExistingAsSubtask(id);
              }}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                cursor:
                  attachBusy || !canNestChildrenUnder ? "not-allowed" : "pointer",
                boxSizing: "border-box",
                marginBottom: 10,
              }}
            >
              <option value="">
                {attachableSubtaskOptions.length === 0 && canNestChildrenUnder
                  ? "No other tasks can be moved here"
                  : "Choose a task to nest under this one…"}
              </option>
              {attachableSubtaskOptions.map((t) => (
                <option key={t._id} value={t._id}>
                  {formatTaskTreeOptionLabel(t)}
                </option>
              ))}
            </select>
            {createTask && (
              <>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginBottom: 4,
                  }}
                >
                  New subtask
                </label>
                <button
                  type="button"
                  disabled={!canAddSubtask || createSubtaskBusy}
                  onClick={() => void handleCreateNewSubtask()}
                  style={{
                    width: "100%",
                    fontSize: 13,
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background:
                      !canAddSubtask || createSubtaskBusy
                        ? "var(--bg-primary)"
                        : "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    cursor:
                      !canAddSubtask || createSubtaskBusy
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: 500,
                  }}
                >
                  {createSubtaskBusy
                    ? "Adding…"
                    : "Create empty subtask"}
                </button>
              </>
            )}
            {!canNestChildrenUnder && (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--accent-amber)",
                  margin: "8px 0 0",
                  lineHeight: 1.4,
                }}
              >
                This task is at the maximum depth; you cannot add subtasks
                under it.
              </p>
            )}
            {canNestChildrenUnder && (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  margin: "8px 0 0",
                  lineHeight: 1.4,
                }}
              >
                Attach moves the chosen task (and its subtasks) to be the last
                child here. Create adds a new blank row as a child.
              </p>
            )}
          </div>
        )}

        {onDuplicate && (
          <div>
            <button
              type="button"
              disabled={duplicateBusy}
              onClick={() => void onDuplicate()}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: duplicateBusy
                  ? "var(--bg-primary)"
                  : "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                cursor: duplicateBusy ? "wait" : "pointer",
                fontWeight: 500,
              }}
            >
              {duplicateBusy
                ? "Duplicating…"
                : "Duplicate (task + all subtasks below)"}
            </button>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "8px 0 0",
                lineHeight: 1.4,
              }}
            >
              Inserts a copy directly under this task in the list, with the same
              fields and nested structure.
            </p>
          </div>
        )}

        {/* Time Estimate */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Clock size={14} /> Time Estimate
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={timeEstimate}
              onChange={(e) => setTimeEstimate(e.target.value)}
              onBlur={() =>
                persistPartial({
                  timeEstimate: timeEstimate ? parseInt(timeEstimate) : null,
                })
              }
              placeholder="0"
              style={{ width: 80 }}
              min={0}
            />
            <select
              value={timeUnit}
              onChange={(e) => {
                const unit = e.target.value as TimeUnit;
                setTimeUnit(unit);
                persistPartial({ timeUnit: unit });
              }}
              style={{ width: 100 }}
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>

        {/* Priority */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => {
              const p = e.target.value as TaskPriority;
              setPriority(p);
              persistPartial({ priority: p });
            }}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6 }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Calendar size={14} /> Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              persistPartial({ startDate: e.target.value || null });
            }}
            style={{ width: "100%" }}
          />
        </div>

        {/* Due Date */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Calendar size={14} /> Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              const v = e.target.value;
              setDueDate(v);
              if (!v) {
                if (section?.type === "todo") {
                  setDueTime("");
                  persistPartial({ dueDate: null, dueTime: null });
                } else {
                  persistPartial({ dueDate: null });
                }
              } else {
                persistPartial({ dueDate: v });
              }
            }}
            style={{ width: "100%" }}
          />
          {section?.type === "todo" && (
            <div style={{ marginTop: 10 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                <Clock size={14} /> Due time
              </label>
              <input
                type="time"
                value={dueTime}
                disabled={!dueDate.trim()}
                onChange={(e) => {
                  const v = e.target.value;
                  setDueTime(v);
                  persistPartial({ dueTime: v.trim() ? v : null });
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  opacity: dueDate.trim() ? 1 : 0.5,
                }}
              />
              {!dueDate.trim() && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.4 }}>
                  Set a due date to enable due time.
                </p>
              )}
            </div>
          )}
          {section?.type === "recurring" && repeatFrequency === "monthly" && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.4 }}>
              Monthly repeats use the <strong>day of month</strong> from this due date.
            </p>
          )}
        </div>

        {section?.type === "recurring" && (
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              <Clock size={14} /> Scheduled time
            </label>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => {
                const v = e.target.value;
                setDueTime(v);
                persistPartial({ dueTime: v.trim() ? v : null });
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
              }}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "6px 0 0",
                lineHeight: 1.4,
              }}
            >
              When this runs on each occurrence. Does not require a due date.
            </p>
          </div>
        )}

        {/* Recurrence (recurring section only) */}
        {section?.type === "recurring" && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Repeats
            </label>
            <select
              value={repeatFrequency}
              onChange={(e) => {
                const v = e.target.value as RepeatFrequency;
                setRepeatFrequency(v);
                if (v === "none") {
                  persistPartial({ repeatFrequency: "none", repeatWeekdays: [] });
                } else if (v === "weekly") {
                  const next =
                    repeatWeekdays.length > 0
                      ? repeatWeekdays
                      : [new Date().getDay()];
                  setRepeatWeekdays(next);
                  persistPartial({ repeatFrequency: v, repeatWeekdays: next });
                } else {
                  persistPartial({ repeatFrequency: v, repeatWeekdays: [] });
                }
              }}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6 }}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {repeatFrequency === "weekly" && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {WEEKDAY_LABELS.map((label, day) => {
                  const on = repeatWeekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const next = on
                          ? repeatWeekdays.filter((d) => d !== day)
                          : [...repeatWeekdays, day].sort((a, b) => a - b);
                        setRepeatWeekdays(next);
                        persistPartial({
                          repeatFrequency: "weekly",
                          repeatWeekdays: next.length ? next : [day],
                        });
                      }}
                      style={{
                        fontSize: 11,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: `1px solid ${on ? "var(--accent-blue)" : "var(--border-color)"}`,
                        background: on ? "rgba(59, 130, 246, 0.15)" : "var(--bg-tertiary)",
                        color: on ? "var(--accent-blue)" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Linked page */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Linked page
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={linkedPageId}
              onChange={async (e) => {
                const v = e.target.value;
                const CREATE_VALUE = "__create_new_page__";
                if (v === CREATE_VALUE) {
                  await createAndLinkNewRootPage();
                  return;
                }
                setLinkedPageId(v);
                persistPartial({ linkedPageId: v || null });
                if (v) await syncPageRootTask(v, task._id);
              }}
              disabled={creatingLinkedPage}
              style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 6 }}
            >
              <option value="">No linked page</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title.trim() || "Untitled"}
                </option>
              ))}
              <option value="__create_new_page__" style={{ fontStyle: "italic" }}>
                Create new page…
              </option>
            </select>
            <button
              type="button"
              disabled={!linkedPageId || creatingLinkedPage}
              onClick={() => {
                if (!linkedPageId) return;
                window.location.href = `/pages?pageId=${encodeURIComponent(linkedPageId)}&taskId=${encodeURIComponent(task._id)}`;
              }}
              style={{
                flexShrink: 0,
                padding: "8px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: linkedPageId ? "var(--accent-blue)" : "var(--text-muted)",
                opacity: linkedPageId ? 1 : 0.6,
                cursor: linkedPageId ? "pointer" : "default",
              }}
            >
              Open
            </button>
          </div>
        </div>

        {/* Links */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <Link size={14} /> Links
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {urls.map((u, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="url"
                  value={u}
                  onChange={(e) => {
                    const next = [...urls];
                    next[i] = e.target.value;
                    setUrls(next);
                  }}
                  onBlur={commitUrls}
                  placeholder="https://..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = urls.filter((_, j) => j !== i);
                    setUrls(next);
                    const cleaned = next.map((x) => x.trim()).filter(Boolean);
                    persistPartial({ urls: cleaned });
                  }}
                  style={{
                    flexShrink: 0,
                    padding: "6px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  title="Remove link"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setUrls((prev) => [...prev, ""])}
              style={{
                alignSelf: "flex-start",
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px dashed var(--border-color)",
                background: "transparent",
                color: "var(--accent-blue)",
                cursor: "pointer",
              }}
            >
              + Add link
            </button>
          </div>
        </div>

        {/* Critical Path */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            <Flag size={14} className={task.isCriticalPath ? "text-amber-400" : ""} />
            Critical Path
          </label>
          <button
            type="button"
            onClick={() => persistPartial({ isCriticalPath: !task.isCriticalPath })}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: task.isCriticalPath ? "var(--critical-path)" : "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              position: "relative",
              transition: "background 0.2s",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: task.isCriticalPath ? 18 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* Sequential */}
        <div style={{ padding: "8px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <ArrowDownRight size={14} />
              Sequential (children in order)
            </label>
            <button
              type="button"
              onClick={() => persistPartial({ isSequential: !task.isSequential })}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: task.isSequential ? "var(--accent-blue)" : "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                position: "relative",
                transition: "background 0.2s",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: task.isSequential ? 18 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
          {task.parentId === null && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.4 }}>
              For the <strong>section’s</strong> top-level list order, use the{" "}
              <strong>Sequential</strong> control in the section header (not this toggle).
            </p>
          )}
        </div>

        {/* Today’s Focus */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ display: "flex", color: isTodayFocused ? "var(--accent-amber)" : "var(--text-secondary)" }}>
              <Flag size={14} />
            </span>
            Today’s focus
          </label>
          <button
            type="button"
            onClick={() =>
              persistPartial({
                todayFocusDate: isTodayFocused ? null : activeTodayFocusYmd,
              })
            }
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: isTodayFocused
                ? "rgba(245, 158, 11, 0.25)"
                : "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              position: "relative",
              padding: 0,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            aria-pressed={isTodayFocused}
            title={isTodayFocused ? "Remove from today’s focus" : "Mark for today’s focus"}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: isTodayFocused ? 18 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* Zoom: subtasks on board vs zoom page */}
        {directChildCount > 0 && (
          <div style={{ padding: "8px 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    color: task.hideSubtasksOnMainBoard
                      ? "var(--accent-blue)"
                      : "var(--text-secondary)",
                  }}
                >
                  <ZoomIn size={14} />
                </span>
                Board: this task only (subtasks on zoom)
              </label>
              <button
                type="button"
                onClick={() =>
                  persistPartial({
                    hideSubtasksOnMainBoard: !task.hideSubtasksOnMainBoard,
                  })
                }
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: task.hideSubtasksOnMainBoard
                    ? "var(--accent-blue)"
                    : "var(--bg-tertiary)",
                  border: "1px solid var(--border-color)",
                  position: "relative",
                  transition: "background 0.2s",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: task.hideSubtasksOnMainBoard ? 18 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "8px 0 0",
                lineHeight: 1.4,
              }}
            >
              When on, subtasks are hidden from the board list. Use the blue zoom
              control on the row or open this task’s page from the zoom icon.
            </p>
          </div>
        )}

        {/* Notes */}
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <FileText size={14} /> Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => persistPartial({ notes })}
            rows={6}
            placeholder="Add notes..."
            style={{
              width: "100%",
              resize: "vertical",
              minHeight: 100,
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
        </div>
      </div>
    </div>
  );
}
