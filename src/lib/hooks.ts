"use client";

import { useState, useEffect, useCallback } from "react";
import { Section, TaskItem, NewTask, TimeUnit, TaskPriority, SectionType } from "./types";

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
        tags: [],
        ...(isRecurring
          ? {
              repeatFrequency: "weekly" as const,
              repeatWeekdays: [new Date().getDay()],
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
        tags: [],
        ...(isRecurring
          ? {
              repeatFrequency: "weekly" as const,
              repeatWeekdays: [new Date().getDay()],
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
    refetch: fetchTasks,
  };
}
