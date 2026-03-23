"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  CollisionDetection,
} from "@dnd-kit/core";
import { useSections, useTasks } from "@/lib/hooks";
import { TaskItem } from "@/lib/types";
import SectionView from "./SectionView";
import TaskRow from "./TaskRow";
import TaskDetailPanel from "./TaskDetailPanel";
import DeleteTaskConfirmModal from "./DeleteTaskConfirmModal";
import CriticalPathTimeline from "./CriticalPathTimeline";
import {
  computeNestMove,
  computeSiblingMove,
  computeSiblingMoveAfter,
} from "@/lib/dndReorder";
import { NEST_HOVER_MS, NEST_BELOW_PREFIX } from "@/lib/constants";

const SHOW_CRITICAL_PATH_STORAGE_KEY = "abundance-show-critical-path";

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
  const { sections, loading: sectionsLoading, updateSection } = useSections();
  const {
    tasks,
    loading: tasksLoading,
    createTask,
    createTaskAfter,
    updateTask,
    deleteTask,
    reorderTasks,
  } = useTasks();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCriticalPath, setShowCriticalPath] = useState(readShowCriticalPath);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Task id currently hovered while dragging; timer starts when this changes. */
  const hoverTargetRef = useRef<string | null>(null);
  const hoverStartRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const selectedTask = useMemo(
    () => tasks.find((t) => t._id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );

  const activeTask = useMemo(
    () => tasks.find((t) => t._id === activeId) || null,
    [tasks, activeId]
  );

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

  const activeTaskSection = useMemo(
    () =>
      activeTask
        ? sections.find((s) => s._id === activeTask.sectionId)
        : undefined,
    [sections, activeTask]
  );

  const projectSection = useMemo(
    () => sections.find((s) => s.type === "project"),
    [sections]
  );

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

  const handleDeleteRequest = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    await deleteTask(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteTask]);

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

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
        {/* Header */}
        <header
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Abundance Strategy
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                margin: "4px 0 0",
              }}
            >
              GTD + Critical Path Method
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {projectSection && (
              <button
                type="button"
                onClick={() => setShowCriticalPath((v) => !v)}
                aria-pressed={showCriticalPath}
                title={
                  showCriticalPath
                    ? "Hide critical path graph"
                    : "Show critical path graph"
                }
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: showCriticalPath
                    ? "var(--bg-tertiary)"
                    : "rgba(75, 156, 245, 0.12)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {showCriticalPath ? "Hide graph" : "Show graph"}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.replace("/login");
                router.refresh();
              }}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        {projectSection && showCriticalPath && (
          <CriticalPathTimeline
            section={projectSection}
            tasks={tasks}
            onSelectTask={(id) => setSelectedTaskId(id)}
          />
        )}

        {projectSection && !showCriticalPath && (
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

        {/* Content */}
        <div style={{ padding: "8px 0" }}>
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
            {sections.map((section) => (
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
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          key={selectedTask._id}
          task={selectedTask}
          onUpdate={updateTask}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      <DeleteTaskConfirmModal
        open={Boolean(pendingDeleteId && pendingDeleteMeta)}
        taskTitle={pendingDeleteMeta?.task.title ?? ""}
        totalRemoving={pendingDeleteMeta?.totalRemoving ?? 1}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
