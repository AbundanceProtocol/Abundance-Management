"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  MeasuringStrategy,
  CollisionDetection,
} from "@dnd-kit/core";
import { useSections, useTasks } from "@/lib/hooks";
import { TaskItem, SectionType } from "@/lib/types";
import { useBoardDndSensors } from "@/lib/boardDndSensors";
import SectionView from "./SectionView";
import CompletedTasksView from "./CompletedTasksView";
import TaskRow from "./TaskRow";
import TaskDetailPanel from "./TaskDetailPanel";
import DeleteTaskConfirmModal from "./DeleteTaskConfirmModal";
import CriticalPathTimeline from "./CriticalPathTimeline";
import { AppNavTasksPages } from "./AppNavTasksPages";
import TaskViewNav from "./TaskViewNav";
import SegmentedBooleanToggle from "./SegmentedBooleanToggle";
import { SEGMENTED_ACTIVE, SEGMENTED_INACTIVE } from "@/lib/segmentedControlStyles";
import {
  computeNestMove,
  computeSiblingMove,
  computeSiblingMoveAfter,
} from "@/lib/dndReorder";
import {
  DUPLICATE_SELECT_TASK_STORAGE_KEY,
  NEST_HOVER_MS,
  NEST_BELOW_PREFIX,
} from "@/lib/constants";
import { taskHasAnyUserData } from "@/lib/taskUserData";
import {
  PROJECT_FOCUSED_VIEW_STORAGE_KEY,
  computeProjectFocusedMainTaskIds,
  computeUndatedProjectSubtreeIds,
} from "@/lib/timelineUtils";
import {
  getActiveTodayFocusYmd,
  msUntilNextTodayFocusReset,
} from "@/lib/todayFocus";
import { useViewportNarrow } from "@/lib/useViewportNarrow";
import {
  MobileAppMenuCollapsedBar,
  MobileAppMenuCollapseButton,
  MOBILE_MENU_BUTTON,
} from "./MobileAppMenu";
import {
  ClipboardList,
  FileText,
  MindMap,
  Settings as SettingsIcon,
} from "./Icons";
import SettingsModal from "./SettingsModal";
import {
  filterSectionsByTasksView,
  parseTasksViewParam,
  tasksViewShortLabel,
  type TasksViewFilter,
} from "@/lib/tasksViewFilter";

const SHOW_CRITICAL_PATH_STORAGE_KEY = "abundance-show-critical-path";
const BOARD_TAB_STORAGE_KEY = "abundance-board-tab";
const SHOW_COMPLETED_MAIN_STORAGE_KEY = "abundance-show-completed-main";
const SHOW_TODAY_FOCUS_ONLY_STORAGE_KEY =
  "abundance-show-today-focus-only";

type BoardLayoutMode = "all" | "today" | "week" | "completed";

function boardLayoutModeLabel(mode: BoardLayoutMode): string {
  switch (mode) {
    case "all":
      return "All tasks";
    case "today":
      return "Today's focus";
    case "week":
      return "Week's focus";
    case "completed":
      return "Completed";
  }
}

function readShowTodayFocusOnly(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(SHOW_TODAY_FOCUS_ONLY_STORAGE_KEY);
    if (v === null) return false;
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function readBoardTab(): "board" | "completed" {
  if (typeof window === "undefined") return "board";
  try {
    const v = localStorage.getItem(BOARD_TAB_STORAGE_KEY);
    return v === "completed" ? "completed" : "board";
  } catch {
    return "board";
  }
}

function readShowCompletedMain(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(SHOW_COMPLETED_MAIN_STORAGE_KEY);
    if (v === null) return false;
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function readShowCriticalPath(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(SHOW_CRITICAL_PATH_STORAGE_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

function readProjectFocusedView(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(PROJECT_FOCUSED_VIEW_STORAGE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function readBoardLayoutMode(): BoardLayoutMode {
  if (typeof window === "undefined") return "all";
  if (readBoardTab() === "completed") return "completed";
  if (readShowTodayFocusOnly()) return "today";
  if (readProjectFocusedView()) return "week";
  return "all";
}

/** Prefer the thin strip below a row (`nest-below-*`) so nesting vs reorder is explicit; else pointer-in-rect; else closest center. */
const nestStripCollision: CollisionDetection = (args) => {
  const pointCollisions = pointerWithin(args);
  if (pointCollisions.length > 0) {
    const nestHit = pointCollisions.find((c) =>
      String(c.id).startsWith(NEST_BELOW_PREFIX)
    );
    if (nestHit) return [nestHit];
    return pointCollisions;
  }
  return closestCenter(args);
};

export default function GTDBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sections, loading: sectionsLoading, updateSection, refetch: refetchSections } = useSections();
  const {
    tasks,
    loading: tasksLoading,
    createTask,
    createTaskAfter,
    updateTask,
    deleteTask,
    reorderTasks,
    duplicateTaskWithSubtree,
    refetch: refetchTasks,
  } = useTasks();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [boardLayoutMode, setBoardLayoutMode] = useState<BoardLayoutMode>(
    readBoardLayoutMode
  );
  const [showCompletedOnMain, setShowCompletedOnMain] = useState(
    readShowCompletedMain
  );
  const [showCriticalPath, setShowCriticalPath] = useState(readShowCriticalPath);
  const [activeTodayFocusYmd, setActiveTodayFocusYmd] = useState(
    getActiveTodayFocusYmd()
  );

  const viewportNarrow = useViewportNarrow();
  /** Mobile: board chrome starts collapsed to leave room for the task list. */
  const [mobileBoardMenuOpen, setMobileBoardMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleImportComplete = useCallback(() => {
    refetchSections();
    refetchTasks();
  }, [refetchSections, refetchTasks]);

  useEffect(() => {
    if (!viewportNarrow) setMobileBoardMenuOpen(false);
  }, [viewportNarrow]);

  const boardTab = boardLayoutMode === "completed" ? "completed" : "board";
  const showTodayFocusOnly = boardLayoutMode === "today";
  const projectFocusedView = boardLayoutMode === "week";
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Task id currently hovered while dragging; timer starts when this changes. */
  const hoverTargetRef = useRef<string | null>(null);
  const hoverStartRef = useRef<number | null>(null);

  const sensors = useBoardDndSensors();

  const selectedTask = useMemo(
    () => tasks.find((t) => t._id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );

  const selectedTaskSection = useMemo(
    () =>
      selectedTask
        ? sections.find((s) => s._id === selectedTask.sectionId) ?? null
        : null,
    [sections, selectedTask]
  );

  const activeTask = useMemo(
    () => tasks.find((t) => t._id === activeId) || null,
    [tasks, activeId]
  );

  useEffect(() => {
    if (pathname !== "/") return;
    try {
      const pending = sessionStorage.getItem(
        DUPLICATE_SELECT_TASK_STORAGE_KEY
      );
      if (pending) {
        sessionStorage.removeItem(DUPLICATE_SELECT_TASK_STORAGE_KEY);
        setSelectedTaskId(pending);
      }
    } catch {
      /* ignore */
    }
  }, [pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SHOW_CRITICAL_PATH_STORAGE_KEY,
        showCriticalPath ? "1" : "0"
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, [showCriticalPath]);

  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;

    const schedule = () => {
      if (cancelled) return;
      const ms = msUntilNextTodayFocusReset(new Date());
      t = window.setTimeout(() => {
        if (cancelled) return;
        setActiveTodayFocusYmd(getActiveTodayFocusYmd(new Date()));
        schedule();
      }, Math.max(0, ms));
    };

    schedule();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        BOARD_TAB_STORAGE_KEY,
        boardLayoutMode === "completed" ? "completed" : "board"
      );
      localStorage.setItem(
        SHOW_TODAY_FOCUS_ONLY_STORAGE_KEY,
        boardLayoutMode === "today" ? "1" : "0"
      );
      localStorage.setItem(
        PROJECT_FOCUSED_VIEW_STORAGE_KEY,
        boardLayoutMode === "week" ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [boardLayoutMode]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SHOW_COMPLETED_MAIN_STORAGE_KEY,
        showCompletedOnMain ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [showCompletedOnMain]);

  const activeTaskSection = useMemo(
    () =>
      activeTask
        ? sections.find((s) => s._id === activeTask.sectionId)
        : undefined,
    [sections, activeTask]
  );

  /** First project section in the account (used for week focus & layout mode guards). */
  const projectSection = useMemo(
    () => sections.find((s) => s.type === "project"),
    [sections]
  );

  const tasksView: TasksViewFilter = useMemo(
    () => parseTasksViewParam(searchParams.get("view")),
    [searchParams]
  );

  const visibleSections = useMemo(
    () => filterSectionsByTasksView(sections, tasksView),
    [sections, tasksView]
  );

  const projectSectionsVisible = useMemo(
    () => visibleSections.filter((s) => s.type === "project"),
    [visibleSections]
  );

  useEffect(() => {
    if (!projectSection && boardLayoutMode === "week") {
      setBoardLayoutMode("all");
    }
  }, [projectSection, boardLayoutMode]);

  const projectSectionTasks = useMemo(
    () =>
      projectSection
        ? tasks.filter((t) => t.sectionId === projectSection._id)
        : [],
    [tasks, projectSection?._id]
  );

  const projectFocusSets = useMemo(() => {
    if (!projectSection || !projectFocusedView) return null;
    return {
      mainIds: computeProjectFocusedMainTaskIds(projectSectionTasks, projectSection),
      undatedIds: computeUndatedProjectSubtreeIds(projectSectionTasks),
    };
  }, [projectSection, projectFocusedView, projectSectionTasks]);

  const pendingDeleteMeta = useMemo(() => {
    if (!pendingDeleteId) return null;
    const task = tasks.find((t) => t._id === pendingDeleteId);
    if (!task) return null;
    const collectIds = (id: string): string[] => {
      const childIds = tasks
        .filter((t) => t.parentId === id)
        .flatMap((t) => collectIds(t._id));
      return [id, ...childIds];
    };
    const ids = collectIds(pendingDeleteId);
    return { task, totalRemoving: ids.length };
  }, [pendingDeleteId, tasks]);

  const handleDeleteRequest = useCallback(
    (id: string) => {
      const task = tasks.find((t) => t._id === id);
      if (!task) return;

      const collectIds = (taskId: string): string[] => {
        const childIds = tasks
          .filter((t) => t.parentId === taskId)
          .flatMap((t) => collectIds(t._id));
        return [taskId, ...childIds];
      };
      const totalRemoving = collectIds(id).length;

      if (totalRemoving > 1) {
        setPendingDeleteId(id);
        return;
      }
      if (!taskHasAnyUserData(task)) {
        void deleteTask(id);
        return;
      }
      setPendingDeleteId(id);
    },
    [tasks, deleteTask]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    await deleteTask(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteTask]);

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const handleDuplicateTask = useCallback(async () => {
    if (!selectedTaskId) return;
    setDuplicateBusy(true);
    try {
      const rootId = await duplicateTaskWithSubtree(selectedTaskId);
      setSelectedTaskId(rootId);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setDuplicateBusy(false);
    }
  }, [selectedTaskId, duplicateTaskWithSubtree]);

  useEffect(() => {
    if (selectedTaskId && !tasks.some((t) => t._id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    if (pendingDeleteId && !tasks.some((t) => t._id === pendingDeleteId)) {
      setPendingDeleteId(null);
    }
  }, [tasks, pendingDeleteId]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    hoverTargetRef.current = null;
    hoverStartRef.current = null;
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      hoverTargetRef.current = null;
      hoverStartRef.current = null;
      return;
    }
    const overId = String(over.id);
    if (overId.startsWith(NEST_BELOW_PREFIX)) {
      if (hoverTargetRef.current !== overId) {
        hoverTargetRef.current = overId;
        hoverStartRef.current = Date.now();
      }
    } else {
      hoverTargetRef.current = null;
      hoverStartRef.current = null;
    }
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    hoverTargetRef.current = null;
    hoverStartRef.current = null;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const hoverTargetId = hoverTargetRef.current;
      const hoverStartTs = hoverStartRef.current;
      hoverTargetRef.current = null;
      hoverStartRef.current = null;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      const activeTask = tasks.find((t) => t._id === active.id);
      if (!activeTask) return;

      const resetTopSortAfterManualReorder = () => {
        if (activeTask.parentId !== null) return;
        const sec = sections.find((s) => s._id === activeTask.sectionId);
        if (sec && (sec.topLevelSort ?? "manual") !== "manual") {
          updateSection({ _id: sec._id, topLevelSort: "manual" });
        }
      };

      const overId = String(over.id);

      /* Strip directly *below* a row: <2s = move after that row; ≥2s = nest into it */
      if (overId.startsWith(NEST_BELOW_PREFIX)) {
        const anchorId = overId.slice(NEST_BELOW_PREFIX.length);
        if (anchorId === String(active.id)) return;

        const anchorTask = tasks.find((t) => t._id === anchorId);
        if (!anchorTask) return;

        const hoveredLongEnough =
          hoverTargetId === overId &&
          hoverStartTs !== null &&
          Date.now() - hoverStartTs >= NEST_HOVER_MS;

        if (hoveredLongEnough) {
          const nestUpdates = computeNestMove(tasks, activeTask, anchorTask);
          if (nestUpdates?.length) {
            reorderTasks(nestUpdates);
            if (anchorTask.collapsed) {
              updateTask({ _id: anchorTask._id, collapsed: false });
            }
          }
          return;
        }

        const afterUpdates = computeSiblingMoveAfter(
          tasks,
          activeTask,
          anchorTask
        );
        if (afterUpdates?.length) {
          reorderTasks(afterUpdates);
          resetTopSortAfterManualReorder();
        }
        return;
      }

      const overTask = tasks.find((t) => t._id === over.id);
      if (!overTask) return;

      const siblingUpdates = computeSiblingMove(tasks, activeTask, overTask);
      if (siblingUpdates?.length) {
        reorderTasks(siblingUpdates);
        resetTopSortAfterManualReorder();
      }
    },
    [tasks, reorderTasks, updateTask, sections, updateSection]
  );

  const handleCreateTask = useCallback(
    async (sectionId: string, parentId: string | null, depth: number) => {
      const created = await createTask(sectionId, parentId, depth);
      if (parentId) {
        const parent = tasks.find((t) => t._id === parentId);
        if (parent?.collapsed) {
          updateTask({ _id: parentId, collapsed: false });
        }
      }
    },
    [createTask, tasks, updateTask]
  );

  const handleCreateTaskAfter = useCallback(
    async (afterTask: TaskItem) => {
      await createTaskAfter(afterTask);
    },
    [createTaskAfter]
  );

  if (sectionsLoading || tasksLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "var(--text-muted)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid var(--border-color)",
              borderTopColor: "var(--accent-blue)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div
        style={{
          flex: 1,
          maxWidth: selectedTask ? "calc(100% - 380px)" : "100%",
          transition: "max-width 0.2s",
        }}
      >
        {viewportNarrow && !mobileBoardMenuOpen && (
          <MobileAppMenuCollapsedBar
            title="Project Manager"
            subtitle={`${tasksViewShortLabel(tasksView)} · ${boardLayoutModeLabel(boardLayoutMode)}`}
            menuId="board-full-menu"
            onExpand={() => setMobileBoardMenuOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            links={
              <>
                <Link
                  href="/"
                  style={{
                    color: "var(--accent-blue)",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <ClipboardList size={12} />
                  Tasks
                </Link>
                <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                  ·
                </span>
                <Link
                  href="/pages"
                  style={{
                    color: "var(--accent-blue)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <FileText size={12} />
                  Pages
                </Link>
                <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                  ·
                </span>
                <Link
                  href="/mind-maps"
                  style={{
                    color: "var(--accent-blue)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MindMap size={12} />
                  Mind Maps
                </Link>
              </>
            }
          />
        )}

        {(!viewportNarrow || mobileBoardMenuOpen) && (
          <>
        <header
          id={viewportNarrow ? "board-full-menu" : undefined}
          style={{
            padding: viewportNarrow ? "12px 16px 12px" : "20px 24px 16px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: viewportNarrow ? 8 : 0,
          }}
        >
          <div
            style={{
              display: "flex",
              // Column + flex-start would shrink-wrap children horizontally; stretch
              // lets the title row span full width so the collapse control sits on the right edge.
              alignItems: viewportNarrow ? "stretch" : "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              width: "100%",
              flexDirection: viewportNarrow ? "column" : "row",
            }}
          >
          <div
            style={
              viewportNarrow
                ? { width: "100%", minWidth: 0 }
                : undefined
            }
          >
            {viewportNarrow && mobileBoardMenuOpen ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                }}
              >
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    margin: 0,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.01em",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  Project Manager
                </h1>
                <MobileAppMenuCollapseButton
                  inline
                  menuId="board-full-menu"
                  onCollapse={() => setMobileBoardMenuOpen(false)}
                />
              </div>
            ) : (
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.01em",
                }}
              >
                Project Manager
              </h1>
            )}
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                margin: "4px 0 0",
              }}
            >
              GTD + Critical Path Method
            </p>
            <div style={{ marginTop: 10 }}>
              <AppNavTasksPages active="tasks" compact={viewportNarrow} />
            </div>
            <div style={{ marginTop: 10, maxWidth: 560 }}>
              <TaskViewNav active={tasksView} compact={viewportNarrow} />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: viewportNarrow ? "flex-start" : "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                overflow: "hidden",
                maxWidth: "100%",
              }}
            >
              {(
                [
                  { mode: "all" as const, label: "All tasks" },
                  {
                    mode: "today" as const,
                    label: "Today's focus",
                    title: "Only tasks marked for today’s focus (and their subtasks)",
                  },
                  {
                    mode: "week" as const,
                    label: "Week's focus",
                    title: projectSection
                      ? "Project: tasks due or starting in the focused window, and unscheduled roots separately"
                      : "Requires a project section",
                    disabled: !projectSection,
                  },
                  { mode: "completed" as const, label: "Completed" },
                ] as const
              ).map((opt, i) => (
                <button
                  key={opt.mode}
                  type="button"
                  disabled={"disabled" in opt ? opt.disabled : false}
                  onClick={() => setBoardLayoutMode(opt.mode)}
                  aria-pressed={boardLayoutMode === opt.mode}
                  aria-label={
                    opt.mode === "week" && !projectSection
                      ? "Week's focus (add a project section to use)"
                      : undefined
                  }
                  title={"title" in opt ? opt.title : undefined}
                  style={{
                    ...(viewportNarrow ? MOBILE_MENU_BUTTON : { fontSize: 13, padding: "6px 12px" }),
                    border: "none",
                    borderLeft: i > 0 ? "1px solid var(--border-color)" : "none",
                    ...("disabled" in opt && opt.disabled
                      ? {
                          background: "transparent",
                          color: "var(--text-muted)",
                          fontWeight: 500,
                          cursor: "not-allowed" as const,
                          opacity: 0.55,
                        }
                      : boardLayoutMode === opt.mode
                        ? SEGMENTED_ACTIVE
                        : SEGMENTED_INACTIVE),
                    flex: "1 1 auto",
                    minWidth: 0,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {boardTab === "board" && (
              <SegmentedBooleanToggle
                label="Completed"
                value={showCompletedOnMain}
                onChange={setShowCompletedOnMain}
                title="Completed tasks on the main board"
                compact={viewportNarrow}
              />
            )}
            {projectSectionsVisible.length > 0 && boardTab === "board" && (
              <SegmentedBooleanToggle
                label="Graph"
                value={showCriticalPath}
                onChange={setShowCriticalPath}
                title="Critical path graph"
                compact={viewportNarrow}
              />
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              style={{
                ...(viewportNarrow ? MOBILE_MENU_BUTTON : { fontSize: 13, padding: "6px 10px" }),
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <SettingsIcon size={15} />
              {!viewportNarrow && "Settings"}
            </button>
          </div>
          </div>
        </header>

        {boardTab === "board" &&
          projectSectionsVisible.length > 0 &&
          showCriticalPath &&
          projectSectionsVisible.map((sec) => (
            <CriticalPathTimeline
              key={sec._id}
              section={sec}
              tasks={tasks}
              onSelectTask={(id) => setSelectedTaskId(id)}
              isFocusedView={projectFocusedView}
              onExitFocusedView={() => setBoardLayoutMode("all")}
            />
          ))}

        {boardTab === "board" &&
          projectSectionsVisible.length > 0 &&
          !showCriticalPath && (
          <div style={{ margin: "0 24px 12px" }}>
            <button
              type="button"
              onClick={() => setShowCriticalPath(true)}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px dashed var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-muted)",
                cursor: "pointer",
                width: "100%",
                maxWidth: 420,
              }}
            >
              Critical path graph hidden — click to show
            </button>
          </div>
        )}
          </>
        )}

        {/* Content */}
        <div style={{ padding: "8px 0" }}>
          {boardTab === "completed" ? (
            <CompletedTasksView
              sections={visibleSections}
              tasks={tasks}
              onUpdateTask={updateTask}
              onSelectTask={setSelectedTaskId}
            />
          ) : visibleSections.length === 0 ? (
            <div
              style={{
                padding: "32px 24px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <p style={{ margin: 0 }}>
                {tasksView === "all"
                  ? "No sections yet."
                  : `No ${tasksViewShortLabel(tasksView).toLowerCase()} sections.`}
              </p>
              {tasksView !== "all" && (
                <p style={{ margin: "12px 0 0", fontSize: 13 }}>
                  <Link href="/" style={{ color: "var(--accent-blue)", fontWeight: 600 }}>
                    Show all sections
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={nestStripCollision}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
              measuring={{
                droppable: { strategy: MeasuringStrategy.Always },
              }}
            >
              {visibleSections.map((section) => (
                <SectionView
                  key={section._id}
                  section={section}
                  tasks={tasks}
                  onUpdateSection={updateSection}
                  onUpdateTask={updateTask}
                  onDeleteTask={handleDeleteRequest}
                  onCreateTask={handleCreateTask}
                  onCreateTaskAfter={handleCreateTaskAfter}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={setSelectedTaskId}
                  showCompletedOnMain={showCompletedOnMain}
                  showTodayFocusOnly={showTodayFocusOnly}
                  activeTodayFocusYmd={activeTodayFocusYmd}
                  projectFocusedView={projectFocusedView}
                  focusedProjectMainIds={projectFocusSets?.mainIds ?? null}
                  focusedProjectUndatedIds={projectFocusSets?.undatedIds ?? null}
                  onExitProjectFocusedView={() => setBoardLayoutMode("all")}
                  showRecurringSectionInsights={tasksView === "recurring"}
                />
              ))}

              <DragOverlay dropAnimation={null}>
                {activeTask ? (
                  <TaskRow
                    task={activeTask}
                    childCount={0}
                    onUpdate={() => {}}
                    onDelete={() => {}}
                    onAddChild={() => {}}
                    onToggleCollapse={() => {}}
                    onSelect={() => {}}
                    isSelected={false}
                    isDragOverlay
                    sectionSequentialForRoot={
                      activeTask.parentId === null
                        ? activeTaskSection?.isSequential ?? false
                        : undefined
                    }
                    sectionType={activeTaskSection?.type}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          key={selectedTask._id}
          task={selectedTask}
          section={selectedTaskSection}
          directChildCount={
            tasks.filter((t) => t.parentId === selectedTask._id).length
          }
          onUpdate={updateTask}
          onClose={() => setSelectedTaskId(null)}
          onDuplicate={handleDuplicateTask}
          duplicateBusy={duplicateBusy}
          tasks={tasks}
          reorderTasks={reorderTasks}
          createTask={createTask}
          onNavigateToTask={(id) => setSelectedTaskId(id)}
        />
      )}

      <DeleteTaskConfirmModal
        open={Boolean(pendingDeleteId && pendingDeleteMeta)}
        taskTitle={pendingDeleteMeta?.task.title ?? ""}
        totalRemoving={pendingDeleteMeta?.totalRemoving ?? 1}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
