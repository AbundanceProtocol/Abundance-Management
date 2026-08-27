"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Section, TaskItem, NewTask, TimeUnit, TaskPriority, SectionType } from "./types";
import {
  mergeMapsLastWriteWins,
  type MindMapsEnvironment,
  type MindMapDocument,
} from "./mindMapTypes";

export function useSections() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSections = useCallback(async () => {
    try {
      const res = await fetch("/api/sections");
      const data = await res.json();
      setSections(data);
    } catch (err) {
      console.error("Failed to fetch sections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const updateSection = useCallback(async (section: Partial<Section> & { _id: string }) => {
    setSections((prev) =>
      prev.map((s) => (s._id === section._id ? { ...s, ...section } : s))
    );
    await fetch("/api/sections", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(section),
    });
  }, []);

  return { sections, loading, updateSection, refetch: fetchSections };
}

export function useTasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = useCallback(
    async (
      sectionId: string,
      parentId: string | null,
      depth: number,
      sectionType?: SectionType
    ) => {
      const siblings = tasks.filter(
        (t) => t.sectionId === sectionId && t.parentId === parentId
      );
      const isRecurring = sectionType === "recurring";
      const newTask: NewTask = {
        sectionId,
        parentId,
        title: "",
        completed: false,
        depth,
        order: siblings.length,
        priority: "medium" as TaskPriority,
        timeEstimate: null,
        timeUnit: "days" as TimeUnit,
        notes: "",
        urls: [],
        startDate: null,
        dueDate: null,
        dueTime: null,
        isCriticalPath: false,
        isSequential: false,
        collapsed: false,
        hideSubtasksOnMainBoard: false,
        tags: [],
        category: "",
        ...(isRecurring
          ? {
              repeatFrequency: "weekly" as const,
              repeatWeekdays: [new Date().getDay()],
              taskWeight: 5,
            }
          : { repeatFrequency: "none" as const }),
      };

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
      const created = await res.json();
      setTasks((prev) => [...prev, created]);
      return created as TaskItem;
    },
    [tasks]
  );

  const updateTask = useCallback(
    async (task: Partial<TaskItem> & { _id: string }) => {
      setTasks((prev) =>
        prev.map((t) => (t._id === task._id ? { ...t, ...task } : t))
      );
      await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
    },
    []
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const collectIds = (taskId: string): string[] => {
        const childIds = tasks
          .filter((t) => t.parentId === taskId)
          .flatMap((t) => collectIds(t._id));
        return [taskId, ...childIds];
      };
      const idsToRemove = collectIds(id);
      setTasks((prev) => prev.filter((t) => !idsToRemove.includes(t._id)));
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    },
    [tasks]
  );

  const reorderTasks = useCallback(
    async (
      updates: {
        _id: string;
        order: number;
        parentId: string | null;
        depth: number;
        sectionId: string;
      }[]
    ) => {
      setTasks((prev) =>
        prev.map((t) => {
          const upd = updates.find((u) => u._id === t._id);
          return upd ? { ...t, ...upd } : t;
        })
      );
      await fetch("/api/tasks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    []
  );

  const duplicateTaskWithSubtree = useCallback(
    async (taskId: string) => {
      const res = await fetch("/api/tasks/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Duplicate failed"
        );
      }
      await fetchTasks();
      return data.rootId as string;
    },
    [fetchTasks]
  );

  const createTaskAfter = useCallback(
    async (afterTask: TaskItem, sectionType?: SectionType) => {
      const { sectionId, parentId, depth } = afterTask;
      const siblings = tasks
        .filter((t) => t.sectionId === sectionId && t.parentId === parentId)
        .sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));

      const toShift = siblings.filter((t) => t.order > afterTask.order);
      const newOrder = afterTask.order + 1;

      const shiftUpdates = toShift.map((t) => ({
        _id: t._id,
        order: t.order + 1,
        parentId: t.parentId,
        depth: t.depth,
        sectionId: t.sectionId,
      }));

      if (shiftUpdates.length > 0) {
        await reorderTasks(shiftUpdates);
      }

      const isRecurring = sectionType === "recurring";
      const newTask: NewTask = {
        sectionId,
        parentId,
        depth,
        order: newOrder,
        title: "",
        completed: false,
        priority: "medium" as TaskPriority,
        timeEstimate: null,
        timeUnit: "days" as TimeUnit,
        notes: "",
        urls: [],
        startDate: null,
        dueDate: null,
        dueTime: null,
        isCriticalPath: false,
        isSequential: false,
        collapsed: false,
        hideSubtasksOnMainBoard: false,
        tags: [],
        category: "",
        ...(isRecurring
          ? {
              repeatFrequency: "weekly" as const,
              repeatWeekdays: [new Date().getDay()],
              taskWeight: 5,
            }
          : { repeatFrequency: "none" as const }),
      };

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
      const created = await res.json();
      setTasks((prev) => [...prev, created]);
      return created as TaskItem;
    },
    [tasks, reorderTasks]
  );

  return {
    tasks,
    setTasks,
    loading,
    createTask,
    createTaskAfter,
    updateTask,
    deleteTask,
    reorderTasks,
    duplicateTaskWithSubtree,
    refetch: fetchTasks,
  };
}

export function useMindMaps() {
  const [maps, setMaps] = useState<MindMapDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  /** While > 0, skip server pulls so an in-flight PUT is not overwritten by stale data. */
  const persistInFlightRef = useRef(0);

  const applyRemoteMaps = useCallback((remote: MindMapDocument[]) => {
    let changed = false;
    setMaps((prev) => {
      const next = mergeMapsLastWriteWins(prev, remote);
      const prevSig = prev.map((m) => `${m.id}:${m.updatedAt}`).sort().join("|");
      const nextSig = next.map((m) => `${m.id}:${m.updatedAt}`).sort().join("|");
      changed = prevSig !== nextSig;
      return next;
    });
    return changed;
  }, []);

  const fetchMaps = useCallback(async () => {
    try {
      const res = await fetch("/api/mind-maps");
      const data = (await res.json()) as MindMapsEnvironment;
      applyRemoteMaps(data.maps ?? []);
    } catch (err) {
      console.error("Failed to fetch mind maps:", err);
    } finally {
      setLoading(false);
    }
  }, [applyRemoteMaps]);

  useEffect(() => {
    fetchMaps();
  }, [fetchMaps]);

  const persist = useCallback(async (next: MindMapDocument[]) => {
    persistInFlightRef.current += 1;
    setMaps(next);
    try {
      await fetch("/api/mind-maps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maps: next }),
      });
    } finally {
      persistInFlightRef.current -= 1;
    }
  }, []);

  /** Pull the latest maps from the server (last-write-wins per map). */
  const pullMaps = useCallback(async (): Promise<{ changed: boolean; skipped?: boolean }> => {
    if (persistInFlightRef.current > 0) {
      return { changed: false, skipped: true };
    }
    setIsPulling(true);
    try {
      const res = await fetch("/api/mind-maps");
      if (!res.ok) throw new Error("Failed to fetch mind maps");
      const data = (await res.json()) as MindMapsEnvironment;
      const changed = applyRemoteMaps(data.maps ?? []);
      return { changed };
    } finally {
      setIsPulling(false);
    }
  }, [applyRemoteMaps]);

  const upsertMap = useCallback(
    async (map: MindMapDocument) => {
      const next = maps.some((m) => m.id === map.id)
        ? maps.map((m) => (m.id === map.id ? map : m))
        : [...maps, map];
      await persist(next);
    },
    [maps, persist]
  );

  const deleteMap = useCallback(
    async (mapId: string) => {
      await persist(maps.filter((m) => m.id !== mapId));
    },
    [maps, persist]
  );

  return { maps, loading, isPulling, upsertMap, deleteMap, pullMaps, refetch: fetchMaps };
}
