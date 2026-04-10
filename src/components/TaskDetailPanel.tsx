"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Lock,
  ZoomIn,
  MindMap,
} from "./Icons";
import { getActiveTodayFocusYmd, msUntilNextTodayFocusReset } from "@/lib/todayFocus";
import {
  getOrCreateDayPage,
  migrateLegacyHubBody,
  pageBodyFromPlainText,
  plainTextFromPageBody,
  isValidYmd,
} from "@/lib/recurringNotesPages";
import { normalizeTaskWeight } from "@/lib/recurrence";
import RecurringTaskNotesModal from "./RecurringTaskNotesModal";
import { buildMindMapFromTasks, importTaskSubtasksIntoMap } from "./MindMapsView";
import type { MindMapDocument } from "@/lib/mindMapTypes";

interface Props {
  task: TaskItem;
  /** Section for the task (recurrence UI only in recurring section). */
  section: Section | null;
  onUpdate: (task: Partial<TaskItem> & { _id: string }) => void;
  onClose: () => void;
  /** Direct children count; used to show "subtasks on board" control. */
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
  const pagesRef = useRef<MarkdownPageItem[]>([]);
  const [recurringNotesPageId, setRecurringNotesPageId] = useState<string | null>(
    task.recurringNotesPageId ?? null
  );
  const [recurringNotesModalOpen, setRecurringNotesModalOpen] = useState(false);
  const [recurringNotesModalDate, setRecurringNotesModalDate] = useState(
    getActiveTodayFocusYmd()
  );
  const [recurringNotesModalText, setRecurringNotesModalText] = useState("");
  const recurringNotesModalDateRef = useRef(recurringNotesModalDate);
  const recurringNotesModalTextRef = useRef(recurringNotesModalText);
  const [recurringNotesSaving, setRecurringNotesSaving] = useState(false);
  const saveRecurringNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const persistRecurringNotesInFlightRef = useRef(false);
  const persistRecurringNotesNeedsAnotherRef = useRef(false);
  const persistRecurringNotesPromiseRef = useRef<Promise<void> | null>(null);
  const ensureRecurringNotesPageInFlightRef = useRef(false);
  const recurringNotesDirtyRef = useRef(false);
  const ensureRecurringNotesPagePromiseRef = useRef<
    Promise<MarkdownPageItem | null> | null
  >(null);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(
    () => task.repeatWeekdays?.length ? [...task.repeatWeekdays] : [new Date().getDay()]
  );
  const [taskWeight, setTaskWeight] = useState(() =>
    normalizeTaskWeight(task.taskWeight)
  );
  const [category, setCategory] = useState(() => (task.category ?? "").trim());
  const existingCategories = useMemo(() => {
    if (!tasks) return [];
    const seen = new Set<string>();
    for (const t of tasks) {
      const c = (t.category ?? "").trim();
      if (c) seen.add(c);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [tasks]);
  const [viewTokens, setViewTokens] = useState<{ _id: string; name: string }[]>([]);
  const [viewTokensLoaded, setViewTokensLoaded] = useState(false);
  const [viewTokensOpen, setViewTokensOpen] = useState(false);
  const [reparentBusy, setReparentBusy] = useState(false);
  const [createSubtaskBusy, setCreateSubtaskBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [creatingLinkedPage, setCreatingLinkedPage] = useState(false);
  const [mindMapSubtaskImportBusy, setMindMapSubtaskImportBusy] = useState(false);
  const [mindMapSubtaskImportNote, setMindMapSubtaskImportNote] = useState<
    string | null
  >(null);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalSyncMsg, setGcalSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setMindMapSubtaskImportNote(null);
    setGcalSyncMsg(null);
  }, [task._id]);

  // Lazy-load view tokens when the visibility section is opened
  useEffect(() => {
    if (!viewTokensOpen || viewTokensLoaded) return;
    fetch("/api/view-tokens")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setViewTokens(Array.isArray(data) ? data : []);
        setViewTokensLoaded(true);
      })
      .catch(() => { setViewTokensLoaded(true); });
  }, [viewTokensOpen, viewTokensLoaded]);

  // Invalidate cache when Settings creates or deletes a view token
  useEffect(() => {
    const handler = () => setViewTokensLoaded(false);
    window.addEventListener("viewtokens:updated", handler);
    return () => window.removeEventListener("viewtokens:updated", handler);
  }, []);

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

  /** Direct subtasks in loaded task data (can disagree with board-only `directChildCount`). */
  const taskDirectSubtaskCount = useMemo(
    () => (tasks ?? []).filter((t) => t.parentId === task._id).length,
    [tasks, task._id]
  );

  const showMindMapSection =
    Boolean(task.mindMapId) ||
    directChildCount > 0 ||
    taskDirectSubtaskCount > 0;

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

  const handleGcalSync = useCallback(async () => {
    setGcalSyncing(true);
    setGcalSyncMsg(null);
    try {
      const res = await fetch(`/api/google-calendar/sync/task/${task._id}`, { method: "POST" });
      if (res.ok) {
        setGcalSyncMsg({ ok: true, text: "Pushed to Google Calendar." });
      } else {
        const data = await res.json().catch(() => ({}));
        setGcalSyncMsg({ ok: false, text: typeof data.error === "string" ? data.error : "Sync failed." });
      }
    } catch {
      setGcalSyncMsg({ ok: false, text: "Network error." });
    } finally {
      setGcalSyncing(false);
    }
  }, [task._id]);

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
    setTaskWeight(normalizeTaskWeight(task.taskWeight));
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

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    recurringNotesModalDateRef.current = recurringNotesModalDate;
  }, [recurringNotesModalDate]);

  useEffect(() => {
    recurringNotesModalTextRef.current = recurringNotesModalText;
  }, [recurringNotesModalText]);

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

  const ensureRecurringNotesPage = useCallback(async (): Promise<MarkdownPageItem | null> => {
    if (!section || section.type !== "recurring") return null;

    if (ensureRecurringNotesPagePromiseRef.current) {
      return ensureRecurringNotesPagePromiseRef.current;
    }

    const job = (async () => {
      ensureRecurringNotesPageInFlightRef.current = true;
      try {
        const res = await fetch("/api/pages");
        const data = (await res.json()) as PagesEnvironment;
        const items = data?.items ?? [];

        const recheckId = recurringNotesPageId ?? task.recurringNotesPageId ?? null;
        if (recheckId) {
          const hit = items.find((p) => p.id === recheckId) ?? null;
          if (hit) {
            setRecurringNotesPageId(hit.id);
            setPages(items);
            return hit;
          }
        }

        const siblings = items.filter((p) => (p.parentId ?? null) === null);
        const newPageId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        const page: MarkdownPageItem = {
          id: newPageId,
          title: "Daily notes",
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
        setRecurringNotesPageId(newPageId);
        persistPartial({ recurringNotesPageId: newPageId });
        return page;
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : "Failed to create notes page");
        return null;
      } finally {
        ensureRecurringNotesPageInFlightRef.current = false;
        ensureRecurringNotesPagePromiseRef.current = null;
      }
    })();

    ensureRecurringNotesPagePromiseRef.current = job;
    return job;
  }, [section, recurringNotesPageId, task.recurringNotesPageId, task._id, persistPartial]);

  const openRecurringNotesModal = useCallback(async () => {
    const hub = await ensureRecurringNotesPage();
    if (!hub) return;

    const res = await fetch("/api/pages");
    const data = (await res.json()) as PagesEnvironment;
    let items = data?.items ?? [];

    const migrated = migrateLegacyHubBody(items, hub.id, task._id);
    items = migrated.items;
    if (migrated.migrated) {
      await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    }

    const hubItem = items.find((p) => p.id === hub.id);
    if (!hubItem) return;

    const ymd = activeTodayFocusYmd;
    const { items: withDay, dayPageId } = getOrCreateDayPage(
      items,
      hubItem,
      task._id,
      ymd
    );
    if (withDay.length > items.length) {
      await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: withDay }),
      });
      items = withDay;
    } else {
      items = withDay;
    }

    const dayPage = items.find((p) => p.id === dayPageId);
    if (!dayPage) return;

    setPages(items);
    setRecurringNotesPageId(hub.id);
    setRecurringNotesModalDate(ymd);
    setRecurringNotesModalText(plainTextFromPageBody(dayPage.body));
    recurringNotesDirtyRef.current = false;
    setRecurringNotesModalOpen(true);
  }, [ensureRecurringNotesPage, activeTodayFocusYmd, task._id]);

  const persistRecurringNotesNow = useCallback(async (): Promise<void> => {
    if (!section || section.type !== "recurring") return;
    if (!recurringNotesDirtyRef.current) return;

    const hubId = recurringNotesPageId ?? task.recurringNotesPageId ?? null;
    if (!hubId) return;

    if (persistRecurringNotesPromiseRef.current) {
      persistRecurringNotesNeedsAnotherRef.current = true;
      return persistRecurringNotesPromiseRef.current;
    }

    const job = (async () => {
      persistRecurringNotesInFlightRef.current = true;
      setRecurringNotesSaving(true);
      try {
        while (true) {
          persistRecurringNotesNeedsAnotherRef.current = false;

          const dateAtWrite = recurringNotesModalDateRef.current;
          const textAtWrite = recurringNotesModalTextRef.current;

          if (!isValidYmd(dateAtWrite)) {
            return;
          }

          const res = await fetch("/api/pages");
          const data = (await res.json()) as PagesEnvironment;
          let items = data?.items ?? [];

          let migrated = migrateLegacyHubBody(items, hubId, task._id);
          items = migrated.items;
          if (migrated.migrated) {
            await fetch("/api/pages", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items }),
            });
          }

          const hub = items.find((p) => p.id === hubId);
          if (!hub) return;

          const { items: withDay, dayPageId } = getOrCreateDayPage(
            items,
            hub,
            task._id,
            dateAtWrite
          );
          items = withDay;

          const trimmed = textAtWrite.trim();
          const nextBody =
            trimmed.length === 0
              ? serializePageDocument(emptyPageDocument())
              : pageBodyFromPlainText(textAtWrite);

          const nextItems = items.map((p) =>
            p.id === dayPageId ? { ...p, body: nextBody } : p
          );

          setPages(nextItems);

          await fetch("/api/pages", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: nextItems }),
          });

          if (
            recurringNotesModalDateRef.current === dateAtWrite &&
            recurringNotesModalTextRef.current === textAtWrite
          ) {
            recurringNotesDirtyRef.current = false;
          }

          if (!persistRecurringNotesNeedsAnotherRef.current) break;
        }
      } catch (e) {
        console.error(e);
        alert(
          e instanceof Error
            ? e.message
            : "Failed to save recurring notes. Please try again."
        );
      } finally {
        setRecurringNotesSaving(false);
        persistRecurringNotesInFlightRef.current = false;
        persistRecurringNotesPromiseRef.current = null;
      }
    })();

    persistRecurringNotesPromiseRef.current = job;
    return job;
  }, [section, recurringNotesPageId, task.recurringNotesPageId, task._id]);

  const handleRecurringNotesDateChange = useCallback(
    (next: string) => {
      const safe = next.trim();
      if (!isValidYmd(safe)) return;

      void (async () => {
        if (recurringNotesDirtyRef.current) {
          await persistRecurringNotesNow();
        }
        const hubId = recurringNotesPageId ?? task.recurringNotesPageId ?? null;
        if (!hubId) return;

        const res = await fetch("/api/pages");
        const data = (await res.json()) as PagesEnvironment;
        let items = data?.items ?? [];

        const migrated = migrateLegacyHubBody(items, hubId, task._id);
        items = migrated.items;
        if (migrated.migrated) {
          await fetch("/api/pages", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          });
        }

        const hubItem = items.find((p) => p.id === hubId);
        if (!hubItem) return;

        const { items: withDay, dayPageId } = getOrCreateDayPage(
          items,
          hubItem,
          task._id,
          safe
        );
        if (withDay.length > items.length) {
          await fetch("/api/pages", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: withDay }),
          });
        }
        items = withDay;

        const dayPage = items.find((p) => p.id === dayPageId);
        if (!dayPage) return;

        setPages(items);
        setRecurringNotesModalDate(safe);
        setRecurringNotesModalText(plainTextFromPageBody(dayPage.body));
        recurringNotesDirtyRef.current = false;
      })();
    },
    [recurringNotesPageId, task.recurringNotesPageId, task._id, persistRecurringNotesNow]
  );

  const handleRecurringNotesTextChange = useCallback((next: string) => {
    recurringNotesDirtyRef.current = true;
    setRecurringNotesModalText(next);
  }, []);

  useEffect(() => {
    if (!recurringNotesModalOpen) return;
    if (!recurringNotesPageId && !task.recurringNotesPageId) return;
    if (!recurringNotesDirtyRef.current) return;
    if (saveRecurringNotesTimerRef.current) {
      clearTimeout(saveRecurringNotesTimerRef.current);
    }
    saveRecurringNotesTimerRef.current = setTimeout(() => {
      void persistRecurringNotesNow();
    }, 550);
    return () => {
      if (saveRecurringNotesTimerRef.current) {
        clearTimeout(saveRecurringNotesTimerRef.current);
      }
    };
  }, [
    recurringNotesModalOpen,
    recurringNotesModalDate,
    recurringNotesModalText,
    recurringNotesPageId,
    task.recurringNotesPageId,
    persistRecurringNotesNow,
  ]);

  const closeRecurringNotesModal = useCallback(async () => {
    try {
      if (!recurringNotesDirtyRef.current) {
        setRecurringNotesModalOpen(false);
        return;
      }
      if (saveRecurringNotesTimerRef.current) {
        clearTimeout(saveRecurringNotesTimerRef.current);
        saveRecurringNotesTimerRef.current = null;
      }
      await persistRecurringNotesNow();
    } finally {
      setRecurringNotesModalOpen(false);
    }
  }, [persistRecurringNotesNow]);

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
        maxWidth: "100%",
        height: "100vh",
        maxHeight: "100dvh",
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
        boxSizing: "border-box",
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
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: 20,
          paddingBottom:
            "calc(20px + max(12px, env(safe-area-inset-bottom, 0px)))",
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
            list="category-suggestions"
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
          <datalist id="category-suggestions">
            {existingCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              margin: "6px 0 0",
              lineHeight: 1.4,
            }}
          >
            Use "Group by category" in the section header to show headings and group
            tasks.
          </p>
        </div>

        {/* View-only visibility */}
        <div>
          <button
            type="button"
            onClick={() => setViewTokensOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text-secondary)",
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 10 }}>{viewTokensOpen ? "▼" : "▶"}</span>
            View-only visibility
          </button>
          {viewTokensOpen && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {!viewTokensLoaded ? (
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>Loading…</p>
              ) : viewTokens.length === 0 ? (
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                  No shared views yet. Create one in Settings → Sharing.
                </p>
              ) : (
                viewTokens.map((vt) => {
                  const hidden = task.hiddenFromViews?.includes(vt._id) ?? false;
                  return (
                    <label
                      key={vt._id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={hidden}
                        onChange={() => {
                          const prev = task.hiddenFromViews ?? [];
                          const next = hidden
                            ? prev.filter((id) => id !== vt._id)
                            : [...prev, vt._id];
                          persistPartial({ hiddenFromViews: next });
                        }}
                        style={{ accentColor: "var(--accent-blue)", width: 14, height: 14 }}
                      />
                      <span style={{ textDecoration: hidden ? "line-through" : "none", color: hidden ? "var(--text-muted)" : "var(--text-primary)" }}>
                        Hide from <strong>{vt.name}</strong>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          )}
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

        {/* Google Calendar manual sync — non-recurring tasks with a due date */}
        {dueDate && repeatFrequency === "none" && (
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
              <Calendar size={14} /> Google Calendar
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={handleGcalSync}
                disabled={gcalSyncing}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: gcalSyncing ? "wait" : "pointer",
                  opacity: gcalSyncing ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                {gcalSyncing ? "Pushing…" : "Push to Calendar"}
              </button>
              {!gcalSyncMsg && task.googleCalendarSyncStatus === "synced" && (
                <span style={{ fontSize: 11, color: "var(--accent-green, #22c55e)" }}>Synced</span>
              )}
              {!gcalSyncMsg && task.googleCalendarSyncStatus === "error" && (
                <span style={{ fontSize: 11, color: "var(--accent-red, #ef4444)" }}>Last sync failed</span>
              )}
              {gcalSyncMsg && (
                <span style={{ fontSize: 11, color: gcalSyncMsg.ok ? "var(--accent-green, #22c55e)" : "var(--accent-red, #ef4444)" }}>
                  {gcalSyncMsg.text}
                </span>
              )}
            </div>
          </div>
        )}

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

        {section?.type === "recurring" && repeatFrequency !== "none" && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Task weight
            </label>
            <select
              value={taskWeight}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTaskWeight(v);
                persistPartial({ taskWeight: v });
              }}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6 }}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
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
              Used for weighted completion on the section calendar (1 = light, 10 = heavy).
            </p>
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

        {/* Lock subtask dragging (direct children) */}
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
                    color: task.lockSubtaskDrag
                      ? "var(--accent-blue)"
                      : "var(--text-secondary)",
                  }}
                >
                  <Lock size={14} />
                </span>
                Lock subtask dragging
              </label>
              <button
                type="button"
                onClick={() =>
                  persistPartial({ lockSubtaskDrag: !task.lockSubtaskDrag })
                }
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: task.lockSubtaskDrag
                    ? "var(--accent-blue)"
                    : "var(--bg-tertiary)",
                  border: "1px solid var(--border-color)",
                  position: "relative",
                  transition: "background 0.2s",
                  padding: 0,
                  cursor: "pointer",
                }}
                aria-pressed={Boolean(task.lockSubtaskDrag)}
                title={
                  task.lockSubtaskDrag
                    ? "Allow dragging to reorder subtasks"
                    : "Prevent drag-reorder of subtasks"
                }
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: task.lockSubtaskDrag ? 18 : 2,
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
              When on, direct subtasks cannot be reordered by dragging on the board
              or task page. You can still change parent or attach tasks from each
              subtask’s details.
            </p>
          </div>
        )}

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

        {/* Mind map toggle */}
        {showMindMapSection && (
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
                    color: task.mindMapId
                      ? "var(--accent-purple)"
                      : "var(--text-secondary)",
                  }}
                >
                  <MindMap size={14} />
                </span>
                Mind map
              </label>
              <button
                type="button"
                onClick={async () => {
                  if (task.mindMapId) {
                    persistPartial({ mindMapId: null });
                  } else {
                    const allTasks = tasks ?? [];
                    const mapNodes = buildMindMapFromTasks(task._id, allTasks);
                    const id =
                      typeof crypto !== "undefined" && crypto.randomUUID
                        ? crypto.randomUUID()
                        : Math.random().toString(36).slice(2) + Date.now().toString(36);
                    const mapDoc: MindMapDocument = {
                      id,
                      title: (task.title || "Untitled") + " \u2014 Mind Map",
                      rootNodeId: mapNodes[0]?.id ?? null,
                      anchorTaskId: task._id,
                      nodes: mapNodes,
                      updatedAt: new Date().toISOString(),
                    };
                    await fetch("/api/mind-maps").then(async (r) => {
                      const env = await r.json();
                      const nextMaps = [...(env?.maps ?? []), mapDoc];
                      await fetch("/api/mind-maps", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ maps: nextMaps }),
                      });
                    });
                    persistPartial({ mindMapId: id });
                  }
                }}
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: task.mindMapId
                    ? "var(--accent-purple)"
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
                    left: task.mindMapId ? 18 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
            {task.mindMapId && (
              <a
                href={`/mind-maps?mapId=${encodeURIComponent(task.mindMapId)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--accent-purple)",
                  marginTop: 6,
                  textDecoration: "none",
                }}
              >
                <MindMap size={12} /> Open mind map
              </a>
            )}
            {task.mindMapId && taskDirectSubtaskCount > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  disabled={mindMapSubtaskImportBusy}
                  onClick={async () => {
                    setMindMapSubtaskImportNote(null);
                    const all = tasks ?? [];
                    setMindMapSubtaskImportBusy(true);
                    try {
                      const res = await fetch("/api/mind-maps");
                      const env = (await res.json()) as { maps?: MindMapDocument[] };
                      const mapList = env?.maps ?? [];
                      const map = mapList.find((m) => m.id === task.mindMapId);
                      if (!map) {
                        setMindMapSubtaskImportNote("Mind map not found.");
                        return;
                      }
                      const next = importTaskSubtasksIntoMap(task._id, map, all);
                      if (!next) {
                        setMindMapSubtaskImportNote(
                          "Add this task to the map first (link it on a task node).",
                        );
                        return;
                      }
                      if (next === map) {
                        setMindMapSubtaskImportNote(
                          "All subtasks are already on the map.",
                        );
                        return;
                      }
                      const nextMaps = mapList.map((m) =>
                        m.id === next.id ? next : m,
                      );
                      await fetch("/api/mind-maps", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ maps: nextMaps }),
                      });
                      setMindMapSubtaskImportNote("Subtasks imported.");
                    } catch {
                      setMindMapSubtaskImportNote("Could not update mind map.");
                    } finally {
                      setMindMapSubtaskImportBusy(false);
                    }
                  }}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    cursor: mindMapSubtaskImportBusy ? "wait" : "pointer",
                    opacity: mindMapSubtaskImportBusy ? 0.7 : 1,
                  }}
                >
                  Import subtasks into map
                </button>
                {mindMapSubtaskImportNote && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      margin: "6px 0 0",
                      lineHeight: 1.4,
                    }}
                  >
                    {mindMapSubtaskImportNote}
                  </p>
                )}
              </div>
            )}
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "6px 0 0",
                lineHeight: 1.4,
              }}
            >
              Generate a mind map from this task and its subtasks. Toggle off to
              unlink (the map stays in the Mind Maps library).
            </p>
          </div>
        )}

        {/* Notes */}
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
            <FileText size={14} />
            {section?.type === "recurring" ? "General notes" : "Notes"}
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

        {section?.type === "recurring" && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Daily notes (saved by date)
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void openRecurringNotesModal()}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add note for today
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const page = await ensureRecurringNotesPage();
                    if (!page) return;
                    const ymd = getActiveTodayFocusYmd();
                    window.location.href = `/pages?pageId=${encodeURIComponent(page.id)}&taskId=${encodeURIComponent(task._id)}&date=${encodeURIComponent(ymd)}`;
                  })();
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "var(--accent-blue)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Open the daily notes hub (list by date)"
              >
                Open notes page
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
              Each date has its own page. The hub lists all days; this modal edits one date at a time.
            </p>
          </div>
        )}

        <RecurringTaskNotesModal
          open={recurringNotesModalOpen}
          taskTitle={task.title}
          dateYmd={recurringNotesModalDate}
          noteText={recurringNotesModalText}
          saving={recurringNotesSaving}
          timeEstimate={task.timeEstimate}
          timeUnit={task.timeUnit}
          onDateChange={handleRecurringNotesDateChange}
          onTextChange={handleRecurringNotesTextChange}
          onClose={() => void closeRecurringNotesModal()}
        />
      </div>
    </div>
  );
}
