"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Section, TaskItem, TopLevelSort, SectionType } from "@/lib/types";
import { buildVisibleTaskTree } from "@/lib/timelineUtils";
import {
  filterTasksForMainView,
  dueBucketForTask,
  formatDueTimeDisplay,
} from "@/lib/recurrence";
import { ChevronRight, ChevronDown, Plus, Comment, ArrowDownRight } from "./Icons";
import { isHiddenFromMainBoardByAncestor } from "@/lib/taskSubtree";
import TaskRow from "./TaskRow";
import NestDropZone from "./NestDropZone";

function dueDateTimeLabel(t: TaskItem): string {
  const tm = formatDueTimeDisplay(t.dueTime);
  if (!t.dueDate?.trim()) return tm || "";
  return tm ? `${t.dueDate} · ${tm}` : t.dueDate;
}

interface Props {
  section: Section;
  tasks: TaskItem[];
  onUpdateSection: (section: Partial<Section> & { _id: string }) => void;
  onUpdateTask: (task: Partial<TaskItem> & { _id: string }) => void;
  onDeleteTask: (id: string) => void;
  onCreateTask: (
    sectionId: string,
    parentId: string | null,
    depth: number,
    sectionType?: SectionType
  ) => void;
  onCreateTaskAfter: (afterTask: TaskItem, sectionType?: SectionType) => void | Promise<void>;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  showCompletedOnMain: boolean;
  /**
   * When enabled, the main list shows only tasks selected for today's focus
   * (and their subtasks), with a "day" that resets at 2:00am local time.
   */
  showTodayFocusOnly?: boolean;
  activeTodayFocusYmd?: string;
  /** Project section: matches Gantt focused view. */
  projectFocusedView?: boolean;
  focusedProjectMainIds?: Set<string> | null;
  focusedProjectUndatedIds?: Set<string> | null;
  onExitProjectFocusedView?: () => void;
  /**
   * When true, the main list shows only section roots; open a task's page to see its subtree.
   * @default true
   */
  showOnlyRootTasksOnMain?: boolean;
}

export default function SectionView({
  section,
  tasks,
  onUpdateSection,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
  onCreateTaskAfter,
  selectedTaskId,
  onSelectTask,
  showCompletedOnMain,
  showTodayFocusOnly = false,
  activeTodayFocusYmd,
  projectFocusedView = false,
  focusedProjectMainIds = null,
  focusedProjectUndatedIds = null,
  onExitProjectFocusedView,
  showOnlyRootTasksOnMain = true,
}: Props) {
  const sectionTasksRaw = useMemo(
    () => tasks.filter((t) => t.sectionId === section._id),
    [tasks, section._id]
  );

  const baseAfterCompleted = useMemo(
    () => filterTasksForMainView(sectionTasksRaw, showCompletedOnMain),
    [sectionTasksRaw, showCompletedOnMain]
  );

  const { sectionTasksMain, sectionTasksUndated } = useMemo(() => {
    if (
      showTodayFocusOnly ||
      section.type !== "project" ||
      !projectFocusedView ||
      !focusedProjectMainIds ||
      !focusedProjectUndatedIds
    ) {
      return {
        sectionTasksMain: baseAfterCompleted,
        sectionTasksUndated: [] as TaskItem[],
      };
    }
    const main = baseAfterCompleted.filter(
      (t) =>
        focusedProjectMainIds.has(t._id) &&
        !focusedProjectUndatedIds.has(t._id)
    );
    const und = baseAfterCompleted.filter((t) =>
      focusedProjectUndatedIds.has(t._id)
    );
    return { sectionTasksMain: main, sectionTasksUndated: und };
  }, [
    section.type,
    projectFocusedView,
    focusedProjectMainIds,
    focusedProjectUndatedIds,
    baseAfterCompleted,
  ]);

  const sectionTasksUndatedRoots = useMemo(
    () =>
      showOnlyRootTasksOnMain
        ? sectionTasksUndated.filter((t) => t.parentId === null)
        : sectionTasksUndated,
    [sectionTasksUndated, showOnlyRootTasksOnMain]
  );

  const recurringDueGroups = useMemo(() => {
    if (section.type !== "recurring") return null;
    const overdue: TaskItem[] = [];
    const today: TaskItem[] = [];
    const soon: TaskItem[] = [];
    for (const t of sectionTasksRaw) {
      if (t.completed || !t.dueDate?.trim()) continue;
      const b = dueBucketForTask(t);
      if (b === "overdue") overdue.push(t);
      else if (b === "today") today.push(t);
      else if (b === "soon") soon.push(t);
    }
    const sortByDue = (a: TaskItem, b: TaskItem) =>
      (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    overdue.sort(sortByDue);
    today.sort(sortByDue);
    soon.sort(sortByDue);
    return { overdue, today, soon };
  }, [section.type, sectionTasksRaw]);

  const taskByIdMain = useMemo(
    () => new Map(baseAfterCompleted.map((t) => [t._id, t])),
    [baseAfterCompleted]
  );

  const todayFocusVisibleIds = useMemo(() => {
    if (!showTodayFocusOnly || !activeTodayFocusYmd) return null;

    const tasksForFocus = baseAfterCompleted;
    const byId = new Map(tasksForFocus.map((t) => [t._id, t]));

    const roots = tasksForFocus.filter(
      (t) => String(t.todayFocusDate ?? "") === activeTodayFocusYmd
    );
    if (roots.length === 0) return new Set<string>();

    const byParent = new Map<string | null, TaskItem[]>();
    for (const t of tasksForFocus) {
      const pid = t.parentId;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(t);
    }

    const visible = new Set<string>();
    const queue: string[] = roots.map((r) => r._id);
    for (const r of roots) visible.add(r._id);

    while (queue.length > 0) {
      const id = queue.shift()!;
      const children = byParent.get(id) ?? [];
      for (const c of children) {
        if (visible.has(c._id)) continue;
        visible.add(c._id);
        queue.push(c._id);
      }
    }

    // Include ancestors so nested children have a path in the list.
    for (const id of Array.from(visible)) {
      let pid: string | null = byId.get(id)?.parentId ?? null;
      const seenAnc = new Set<string>();
      while (pid && !seenAnc.has(pid)) {
        seenAnc.add(pid);
        if (byId.has(pid)) visible.add(pid);
        pid = byId.get(pid)?.parentId ?? null;
      }
    }

    return visible;
  }, [showTodayFocusOnly, activeTodayFocusYmd, baseAfterCompleted]);

  const collapsedIds = useMemo(
    () => {
      if (showTodayFocusOnly) return new Set<string>();
      return new Set(sectionTasksMain.filter((t) => t.collapsed).map((t) => t._id));
    },
    [sectionTasksMain, showTodayFocusOnly]
  );

  const collapsedIdsUndated = useMemo(
    () =>
      {
        if (showTodayFocusOnly) return new Set<string>();
        return new Set(
          sectionTasksUndatedRoots.filter((t) => t.collapsed).map((t) => t._id)
        );
      },
    [sectionTasksUndatedRoots, showTodayFocusOnly]
  );

  const sectionTasksMainEffective = useMemo(() => {
    if (!showTodayFocusOnly || !todayFocusVisibleIds) return sectionTasksMain;
    return sectionTasksMain.filter((t) => todayFocusVisibleIds.has(t._id));
  }, [sectionTasksMain, showTodayFocusOnly, todayFocusVisibleIds]);

  const flatTasksTree = useMemo(
    () =>
      buildVisibleTaskTree(
        sectionTasksMainEffective,
        null,
        collapsedIds,
        section.topLevelSort ?? "manual"
      ),
    [sectionTasksMainEffective, collapsedIds, section.topLevelSort]
  );

  const flatTasks = useMemo(
    () =>
      flatTasksTree.filter(
        (t) => !isHiddenFromMainBoardByAncestor(t, taskByIdMain)
      ),
    [flatTasksTree, taskByIdMain]
  );

  const flatTasksUndatedTree = useMemo(
    () =>
      buildVisibleTaskTree(
        sectionTasksUndatedRoots,
        null,
        collapsedIdsUndated,
        section.topLevelSort ?? "manual"
      ),
    [
      sectionTasksUndatedRoots,
      collapsedIdsUndated,
      section.topLevelSort,
    ]
  );

  const flatTasksUndated = useMemo(
    () =>
      flatTasksUndatedTree.filter((t) =>
        showTodayFocusOnly
          ? todayFocusVisibleIds
            ? todayFocusVisibleIds.has(t._id)
            : false
          : !isHiddenFromMainBoardByAncestor(t, taskByIdMain)
      ),
    [flatTasksUndatedTree, taskByIdMain, showTodayFocusOnly, todayFocusVisibleIds]
  );

  const taskIds = useMemo(() => flatTasks.map((t) => t._id), [flatTasks]);

  const undatedTaskIds = useMemo(
    () => flatTasksUndated.map((t) => t._id),
    [flatTasksUndated]
  );

  const childCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of baseAfterCompleted) {
      if (t.parentId) {
        map[t.parentId] = (map[t.parentId] || 0) + 1;
      }
    }
    return map;
  }, [baseAfterCompleted]);

  const toggleCollapse = (taskId: string) => {
    const t =
      sectionTasksMain.find((x) => x._id === taskId) ??
      sectionTasksUndatedRoots.find((x) => x._id === taskId);
    if (t) {
      onUpdateTask({ _id: taskId, collapsed: !t.collapsed });
    }
  };

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== section.title) {
      onUpdateSection({ _id: section._id, title: next });
    } else {
      setTitleDraft(section.title);
    }
    setEditingTitle(false);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Section Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 16px",
          cursor: "pointer",
          userSelect: "none",
          gap: 8,
        }}
        className="section-header"
      >
        <button
          type="button"
          onClick={() =>
            onUpdateSection({
              _id: section._id,
              collapsed: !section.collapsed,
            })
          }
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: 0,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {section.collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>

        <div className="section-header-title-wrap">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") {
                  setTitleDraft(section.title);
                  setEditingTitle(false);
                }
              }}
              className="section-header-title-input"
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: "var(--text-primary)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--accent-blue)",
                borderRadius: 4,
                padding: "2px 6px",
                minWidth: 0,
                width: "100%",
                maxWidth: "100%",
              }}
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => setEditingTitle(true)}
              className="section-header-title-btn"
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: "var(--text-primary)",
                background: "none",
                border: "none",
                padding: "2px 4px",
                borderRadius: 4,
                cursor: "text",
                textAlign: "left",
                width: "100%",
                minWidth: 0,
              }}
              title="Double-click to rename section"
            >
              {section.title}
            </button>
          )}
        </div>

        <span
          className="section-header-count"
          style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}
        >
          {sectionTasksMain.filter((t) => t.parentId === null).length}
        </span>

        <div className="section-header-toolbar">
          <button
            type="button"
            onClick={() =>
              onUpdateSection({
                _id: section._id,
                isSequential: !section.isSequential,
              })
            }
            title={
              section.isSequential
                ? "Top-level tasks are sequential (on)"
                : "Top-level tasks are sequential (off)"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: section.isSequential ? "rgba(59, 130, 246, 0.15)" : "var(--bg-tertiary)",
              color: section.isSequential ? "var(--accent-blue)" : "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <ArrowDownRight size={12} />
            Sequential
          </button>

          <select
            value={section.topLevelSort ?? "manual"}
            onChange={(e) =>
              onUpdateSection({
                _id: section._id,
                topLevelSort: e.target.value as TopLevelSort,
              })
            }
            title="Sort top-level tasks (nested subtasks keep manual order)"
            style={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              maxWidth: 148,
            }}
          >
            <option value="manual">Order (manual)</option>
            <option value="priority">Priority</option>
            <option value="startDate">Start date</option>
          </select>
        </div>

        <div className="section-header-spacer" style={{ flex: 1, minWidth: 8 }} />

        <button
          type="button"
          onClick={() => onCreateTask(section._id, null, 0, section.type)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            opacity: 0.6,
            transition: "opacity 0.15s",
          }}
          className="section-add-btn"
          title="Add task"
        >
          <Plus size={16} />
        </button>

        <button
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            opacity: 0.6,
          }}
        >
          <Comment size={16} />
        </button>
      </div>

      {/* Recurring: due & upcoming */}
      {!section.collapsed && recurringDueGroups && (
        (recurringDueGroups.overdue.length > 0 ||
          recurringDueGroups.today.length > 0 ||
          recurringDueGroups.soon.length > 0) && (
          <div
            style={{
              margin: "0 16px 10px 44px",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              fontSize: 12,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 8,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Due & upcoming
            </div>
            {recurringDueGroups.overdue.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>Overdue</span>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--text-muted)" }}>
                  {recurringDueGroups.overdue.map((t) => (
                    <li key={t._id}>
                      <button
                        type="button"
                        onClick={() => onSelectTask(t._id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: "var(--accent-blue)",
                          textAlign: "left",
                          fontSize: 12,
                        }}
                      >
                        {t.title.trim() || "Untitled"}
                      </button>
                      <span style={{ marginLeft: 6, opacity: 0.85 }}>
                        ({t.dueDate})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {recurringDueGroups.today.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "var(--accent-amber)", fontWeight: 600 }}>Due today</span>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--text-muted)" }}>
                  {recurringDueGroups.today.map((t) => (
                    <li key={t._id}>
                      <button
                        type="button"
                        onClick={() => onSelectTask(t._id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: "var(--accent-blue)",
                          textAlign: "left",
                          fontSize: 12,
                        }}
                      >
                        {t.title.trim() || "Untitled"}
                      </button>
                      {t.dueTime?.trim() && (
                        <span style={{ marginLeft: 6, opacity: 0.85 }}>
                          ({formatDueTimeDisplay(t.dueTime)})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {recurringDueGroups.soon.length > 0 && (
              <div>
                <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Next 7 days</span>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--text-muted)" }}>
                  {recurringDueGroups.soon.map((t) => (
                    <li key={t._id}>
                      <button
                        type="button"
                        onClick={() => onSelectTask(t._id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: "var(--accent-blue)",
                          textAlign: "left",
                          fontSize: 12,
                        }}
                      >
                        {t.title.trim() || "Untitled"}
                      </button>
                      <span style={{ marginLeft: 6, opacity: 0.85 }}>
                        ({dueDateTimeLabel(t)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}

      {/* Task List */}
      {!section.collapsed && (
        <div style={{ paddingLeft: 8 }}>
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            {flatTasks.map((task) => (
              <React.Fragment key={task._id}>
                <TaskRow
                  task={task}
                  childCount={childCountMap[task._id] || 0}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                  onAddChild={() =>
                    onCreateTask(section._id, task._id, task.depth + 1, section.type)
                  }
                  onCreateSiblingAfter={() => onCreateTaskAfter(task, section.type)}
                  onToggleCollapse={() => toggleCollapse(task._id)}
                  onSelect={() => onSelectTask(task._id)}
                  isSelected={selectedTaskId === task._id}
                  isTodayFocused={
                    Boolean(
                      activeTodayFocusYmd &&
                        task.todayFocusDate === activeTodayFocusYmd
                    )
                  }
                  sectionSequentialForRoot={
                    task.parentId === null ? section.isSequential : undefined
                  }
                  sectionType={section.type}
                />
                <NestDropZone taskId={task._id} />
              </React.Fragment>
            ))}
          </SortableContext>

          {section.type === "project" &&
            projectFocusedView &&
            sectionTasksUndatedRoots.length > 0 && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid var(--border-color)",
              }}
            >
              <div style={{ padding: "0 8px 10px 16px" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Unscheduled
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  Top-level tasks with no start or due date (and their subtasks).
                </div>
              </div>
              <SortableContext
                items={undatedTaskIds}
                strategy={verticalListSortingStrategy}
              >
                {flatTasksUndated.map((task) => (
                  <React.Fragment key={task._id}>
                    <TaskRow
                      task={task}
                      childCount={childCountMap[task._id] || 0}
                      onUpdate={onUpdateTask}
                      onDelete={onDeleteTask}
                      onAddChild={() =>
                        onCreateTask(section._id, task._id, task.depth + 1, section.type)
                      }
                      onCreateSiblingAfter={() =>
                        onCreateTaskAfter(task, section.type)
                      }
                      onToggleCollapse={() => toggleCollapse(task._id)}
                      onSelect={() => onSelectTask(task._id)}
                      isSelected={selectedTaskId === task._id}
                      isTodayFocused={
                        Boolean(
                          activeTodayFocusYmd &&
                            task.todayFocusDate === activeTodayFocusYmd
                        )
                      }
                      sectionSequentialForRoot={
                        task.parentId === null ? section.isSequential : undefined
                      }
                      sectionType={section.type}
                    />
                    <NestDropZone taskId={task._id} />
                  </React.Fragment>
                ))}
              </SortableContext>
            </div>
          )}

          {flatTasks.length === 0 &&
            !(
              section.type === "project" &&
              projectFocusedView &&
              sectionTasksUndatedRoots.length > 0
            ) && (
              <div
                style={{
                  padding: "8px 16px 8px 44px",
                  color: "var(--text-muted)",
                  fontSize: 13,
                  fontStyle: "italic",
                }}
              >
                {section.type === "project" &&
                projectFocusedView &&
                sectionTasksUndatedRoots.length === 0 ? (
                  <>
                    No tasks match Focused view in the main list.{" "}
                    {onExitProjectFocusedView && (
                      <button
                        type="button"
                        onClick={onExitProjectFocusedView}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--accent-blue)",
                          fontSize: 13,
                          padding: 0,
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        Show all tasks
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    No tasks yet.{" "}
                    <button
                      type="button"
                      onClick={() => onCreateTask(section._id, null, 0, section.type)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-blue)",
                        fontSize: 13,
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      Add one
                    </button>
                  </>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
