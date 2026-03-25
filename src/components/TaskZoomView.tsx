"use client";

import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
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
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSections, useTasks } from "@/lib/hooks";
import { TaskItem, SectionType } from "@/lib/types";
import { buildVisibleTaskTree } from "@/lib/timelineUtils";
import { filterTasksForMainView } from "@/lib/recurrence";
import { filterSubtreeTasks } from "@/lib/taskSubtree";
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
import TaskRow from "./TaskRow";
import NestDropZone from "./NestDropZone";
import TaskDetailPanel from "./TaskDetailPanel";
import DeleteTaskConfirmModal from "./DeleteTaskConfirmModal";

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

export default function TaskZoomView({ taskId }: { taskId: string }) {
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
    duplicateTaskWithSubtree,
  } = useTasks();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hoverTargetRef = useRef<string | null>(null);
  const hoverStartRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const anchor = useMemo(
    () => tasks.find((t) => t._id === taskId) ?? null,
    [tasks, taskId]
  );

  const section = useMemo(
    () =>
      anchor ? sections.find((s) => s._id === anchor.sectionId) ?? null : null,
    [sections, anchor]
  );

  const subtreeTasks = useMemo(
    () => (anchor ? filterSubtreeTasks(tasks, taskId) : []),
    [tasks, anchor, taskId]
  );

  /** Zoom page always lists completed tasks so the anchor row stays addressable. */
  const baseList = useMemo(
    () => filterTasksForMainView(subtreeTasks, true),
    [subtreeTasks]
  );

  const collapsedIds = useMemo(
    () => new Set(baseList.filter((t) => t.collapsed).map((t) => t._id)),
    [baseList]
  );

  const flatTasks = useMemo(() => {
    if (!anchor || !section) return [];
    const rest = buildVisibleTaskTree(
      baseList,
      anchor._id,
      collapsedIds,
      section.topLevelSort ?? "manual"
    );
    return [anchor, ...rest];
  }, [anchor, section, baseList, collapsedIds]);

  const childCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of baseList) {
      if (t.parentId) {
        map[t.parentId] = (map[t.parentId] || 0) + 1;
      }
    }
    return map;
  }, [baseList]);

  const taskIds = useMemo(() => flatTasks.map((t) => t._id), [flatTasks]);

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

  const activeTaskSection = useMemo(
    () =>
      activeTask
        ? sections.find((s) => s._id === activeTask.sectionId)
        : undefined,
    [sections, activeTask]
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
        void deleteTask(id).then(() => {
          if (id === taskId) router.replace("/");
        });
        return;
      }
      setPendingDeleteId(id);
    },
    [tasks, deleteTask, router, taskId]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    await deleteTask(id);
    setPendingDeleteId(null);
    if (id === taskId) router.replace("/");
  }, [pendingDeleteId, deleteTask, router, taskId]);

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const handleDuplicateTask = useCallback(async () => {
    if (!selectedTaskId) return;
    setDuplicateBusy(true);
    try {
      const zoomAnchorWasDuplicated = selectedTaskId === taskId;
      const newRootId = await duplicateTaskWithSubtree(selectedTaskId);
      if (zoomAnchorWasDuplicated) {
        try {
          sessionStorage.setItem(
            DUPLICATE_SELECT_TASK_STORAGE_KEY,
            newRootId
          );
        } catch {
          /* ignore */
        }
        router.replace("/");
      } else {
        setSelectedTaskId(newRootId);
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setDuplicateBusy(false);
    }
  }, [selectedTaskId, taskId, duplicateTaskWithSubtree, router]);

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

      if (overId.startsWith(NEST_BELOW_PREFIX)) {
        const anchorRowId = overId.slice(NEST_BELOW_PREFIX.length);
        if (anchorRowId === String(active.id)) return;

        const anchorTask = tasks.find((t) => t._id === anchorRowId);
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
    async (
      sectionId: string,
      parentId: string | null,
      depth: number,
      sectionType?: SectionType
    ) => {
      const created = await createTask(sectionId, parentId, depth, sectionType);
      if (parentId) {
        const parent = tasks.find((t) => t._id === parentId);
        if (parent?.collapsed) {
          updateTask({ _id: parentId, collapsed: false });
        }
      }
      return created;
    },
    [createTask, tasks, updateTask]
  );

  const handleCreateTaskAfter = useCallback(
    async (afterTask: TaskItem) => {
      await createTaskAfter(afterTask, section?.type);
    },
    [createTaskAfter, section?.type]
  );

  const toggleCollapse = useCallback(
    (id: string) => {
      const t = baseList.find((x) => x._id === id);
      if (t) {
        updateTask({ _id: id, collapsed: !t.collapsed });
      }
    },
    [baseList, updateTask]
  );

  if (sectionsLoading || tasksLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "40vh",
          color: "var(--text-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!anchor || !section) {
    return (
      <div style={{ padding: 24, maxWidth: 480 }}>
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
          This task could not be found. It may have been deleted.
        </p>
        <Link
          href="/"
          style={{ color: "var(--accent-blue)", fontWeight: 600 }}
        >
          Back to board
        </Link>
      </div>
    );
  }

  const depthIndentOffset = anchor.depth;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div
        style={{
          flex: 1,
          maxWidth: selectedTask ? "calc(100% - 380px)" : "100%",
          transition: "max-width 0.2s",
        }}
      >
        <header
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            <Link
              href="/"
              style={{ color: "var(--accent-blue)", fontWeight: 600 }}
            >
              Board
            </Link>
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <Link
              href={`/task/${taskId}/workspace`}
              style={{ color: "var(--accent-blue)", fontWeight: 600 }}
            >
              Workspace
            </Link>
            {anchor.parentId && (
              <>
                <span style={{ color: "var(--text-muted)" }}>/</span>
                <Link
                  href={`/task/${anchor.parentId}`}
                  style={{ color: "var(--accent-blue)" }}
                >
                  Parent task
                </Link>
              </>
            )}
          </div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: 0,
              color: "var(--text-primary)",
            }}
          >
            {anchor.title.trim() || "Untitled"}
          </h1>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: "8px 0 0",
            }}
          >
            Section: {section.title}
          </p>
        </header>

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
                      onUpdate={updateTask}
                      onDelete={handleDeleteRequest}
                      onAddChild={() =>
                        handleCreateTask(
                          section._id,
                          task._id,
                          task.depth + 1,
                          section.type
                        )
                      }
                      onCreateSiblingAfter={() =>
                        handleCreateTaskAfter(task)
                      }
                      onToggleCollapse={() => toggleCollapse(task._id)}
                      onSelect={() => setSelectedTaskId(task._id)}
                      isSelected={selectedTaskId === task._id}
                      sectionSequentialForRoot={
                        task.parentId === null
                          ? section.isSequential
                          : undefined
                      }
                      sectionType={section.type}
                      depthIndentOffset={depthIndentOffset}
                      sortableDisabled={task._id === anchor._id}
                    />
                    <NestDropZone taskId={task._id} />
                  </React.Fragment>
                ))}
              </SortableContext>
            </div>

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
                  depthIndentOffset={depthIndentOffset}
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
        </div>
      </div>

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
