"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
  pointerWithin,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTasks, useSections } from "@/lib/hooks";
import type { TaskItem } from "@/lib/types";
import {
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  LayoutGrid,
  Menu,
  Check,
  Pencil,
  Trash,
} from "./Icons";
import {
  MarkdownPageItem,
  PagesEnvironment,
  DEFAULT_PAGES_ENVIRONMENT,
} from "@/lib/pagesTypes";
import {
  computePageNestMove,
  computePageSiblingMove,
  computePageSiblingMoveAfter,
} from "@/lib/pagesReorder";
import PageBlockEditor from "./PageBlockEditor";
import RecurringNotesAggregateView from "./RecurringNotesAggregateView";
import { AppNavTasksPages } from "./AppNavTasksPages";
import { emptyPageDocument, parsePageBody, serializePageDocument } from "@/lib/pageDocument";
import { orderTasksForPageLinkPicker } from "@/lib/pageTaskPickerOrder";
import {
  getOrCreateDayPage,
  migrateLegacyHubBody,
  pageBodyFromPlainText,
} from "@/lib/recurringNotesPages";
import { useBoardDndSensors } from "@/lib/boardDndSensors";
import { VIEWPORT_NARROW_MQ, useViewportNarrow } from "@/lib/useViewportNarrow";
import TaskDetailPanel from "./TaskDetailPanel";

const NEST_HOVER_MS = 1200;
const PAGE_NEST_BELOW_PREFIX = "page-nest-below-";
type MobileMenuKey = "layout" | "meta" | "toolbar" | "tasks";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nestBelowId(pageId: string): string {
  return `${PAGE_NEST_BELOW_PREFIX}${pageId}`;
}

const collisionDetection: CollisionDetection = (args) => {
  const point = pointerWithin(args);
  if (point.length > 0) {
    const nestHit = point.find((c) => String(c.id).startsWith(PAGE_NEST_BELOW_PREFIX));
    if (nestHit) return [nestHit];
    return point;
  }
  return closestCenter(args);
};

function normalizeEnvironment(raw: PagesEnvironment | null | undefined): PagesEnvironment {
  if (!raw?.items?.length) return DEFAULT_PAGES_ENVIRONMENT;
  const items = raw.items.map((it, idx) => ({
    ...it,
    linkedTaskId: it.linkedTaskId ?? null,
    parentId: it.parentId ?? null,
    depth: Number.isFinite(it.depth) ? it.depth : 0,
    order: Number.isFinite(it.order) ? it.order : idx,
    recurringNoteDateYmd:
      it.recurringNoteDateYmd === undefined || it.recurringNoteDateYmd === ""
        ? null
        : it.recurringNoteDateYmd,
  }));
  return { items };
}

function buildVisibleList(
  items: MarkdownPageItem[],
  collapsedIds: Set<string>
): MarkdownPageItem[] {
  const byParent = new Map<string | null, MarkdownPageItem[]>();
  for (const item of items) {
    const arr = byParent.get(item.parentId) ?? [];
    arr.push(item);
    byParent.set(item.parentId, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.order - b.order);
  }
  const out: MarkdownPageItem[] = [];
  const walk = (parentId: string | null) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      out.push(child);
      if (!collapsedIds.has(child.id)) walk(child.id);
    }
  };
  walk(null);
  return out;
}

export default function PagesView() {
  const searchParams = useSearchParams();
  const initialPageId = searchParams.get("pageId");
  const initialTaskId = searchParams.get("taskId");
  const initialDateYmd = searchParams.get("date");
  const { tasks, updateTask, createTask, reorderTasks } = useTasks();
  const { sections } = useSections();
  const [environment, setEnvironment] = useState<PagesEnvironment>(DEFAULT_PAGES_ENVIRONMENT);
  const [loading, setLoading] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [paneCount, setPaneCount] = useState<1 | 2 | 3 | 4>(1);
  const [openPageIds, setOpenPageIds] = useState<Array<string | null>>([null]);
  const [activePaneIndex, setActivePaneIndex] = useState(0);
  const [editingByPane, setEditingByPane] = useState<boolean[]>([true]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const hoverTargetRef = useRef<string | null>(null);
  const hoverStartRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pagesSidebarMinimized, setPagesSidebarMinimized] = useState(false);
  const [mobilePaneMetaCollapsed, setMobilePaneMetaCollapsed] = useState(true);
  const [mobileLayoutMenuOpen, setMobileLayoutMenuOpen] = useState(false);
  const [narrowMobileToolbarOpen, setNarrowMobileToolbarOpen] = useState(false);
  const [tasksPanelCollapsed, setTasksPanelCollapsed] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  /** Ignore collapse briefly after open — same tap can hit the panel collapse control after layout shifts. */
  const ignoreTasksPanelCloseUntilRef = useRef(0);
  const deepLinkDateHandledRef = useRef(false);
  const [recurringHubSortOrder, setRecurringHubSortOrder] = useState<"asc" | "desc">(
    "desc"
  );

  const setTasksPanelCollapsedSafe = useCallback((collapsed: boolean) => {
    if (collapsed && Date.now() < ignoreTasksPanelCloseUntilRef.current) {
      return;
    }
    setTasksPanelCollapsed(collapsed);
  }, []);

  const isNarrowPagesLayout = useViewportNarrow();
  const sidebarHidden = isNarrowPagesLayout && pagesSidebarMinimized;

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia(VIEWPORT_NARROW_MQ).matches) {
      setMobileLayoutMenuOpen(false);
      setMobilePaneMetaCollapsed(true);
      setTasksPanelCollapsed(true);
      setNarrowMobileToolbarOpen(false);
    }
  }, []);

  const mobileIconBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: 10,
    border: "1px solid var(--border-color)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    cursor: "pointer",
    flexShrink: 0,
  };
  const mobileIconBtnStyle = useCallback(
    (active: boolean): React.CSSProperties => ({
      ...mobileIconBtn,
      border: active
        ? "1px solid rgba(96, 165, 250, 0.75)"
        : "1px solid var(--border-color)",
      background: active ? "rgba(59,130,246,0.2)" : "var(--bg-tertiary)",
      color: active ? "var(--text-primary)" : "var(--text-primary)",
    }),
    [mobileIconBtn]
  );

  const sensors = useBoardDndSensors();

  const persist = useCallback((next: PagesEnvironment) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    }, 450);
  }, []);

  const setAndPersist = useCallback(
    (updater: (prev: PagesEnvironment) => PagesEnvironment) => {
      setEnvironment((prev) => {
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/pages");
        const data = (await res.json()) as PagesEnvironment;
        let normalized = normalizeEnvironment(data);
        if (initialPageId && initialTaskId) {
          const hit = normalized.items.find((p) => p.id === initialPageId);
          if (hit && hit.linkedTaskId !== initialTaskId) {
            normalized = {
              items: normalized.items.map((p) =>
                p.id === initialPageId ? { ...p, linkedTaskId: initialTaskId } : p
              ),
            };
            void fetch("/api/pages", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(normalized),
            });
          }
        }

        let preferred: string | null = null;
        if (normalized.items.length > 0) {
          const basePreferred =
            initialPageId && normalized.items.some((p) => p.id === initialPageId)
              ? initialPageId
              : normalized.items[0].id;
          preferred = basePreferred;

          const deepDate =
            initialDateYmd &&
            initialPageId &&
            initialTaskId &&
            /^\d{4}-\d{2}-\d{2}$/.test(initialDateYmd.trim())
              ? initialDateYmd.trim()
              : null;

          if (
            deepDate &&
            initialPageId &&
            initialTaskId &&
            !deepLinkDateHandledRef.current
          ) {
            deepLinkDateHandledRef.current = true;
            const taskId = initialTaskId;
            const hub = normalized.items.find((p) => p.id === initialPageId);
            if (hub && hub.linkedTaskId === taskId) {
              let items = normalized.items;
              const migrated = migrateLegacyHubBody(items, hub.id, taskId);
              items = migrated.items;
              if (migrated.migrated) {
                await fetch("/api/pages", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ items }),
                });
              }
              const hubItem = items.find((p) => p.id === hub.id);
              if (hubItem) {
                const { items: withDay, dayPageId } = getOrCreateDayPage(
                  items,
                  hubItem,
                  taskId,
                  deepDate
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
                normalized = { items };
                preferred = dayPageId;
              }
            }
          }
        }

        setEnvironment(normalized);
        if (normalized.items.length > 0 && preferred) {
          setSelectedPageId(preferred);
          setOpenPageIds([preferred]);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [initialPageId, initialTaskId, initialDateYmd]);

  useEffect(() => {
    if (!selectedPageId) return;
    const page = environment.items.find((p) => p.id === selectedPageId);
    if (!page?.linkedTaskId) return;
    const task = tasks.find((t) => t._id === page.linkedTaskId);
    if (!task || task.recurringNotesPageId !== page.id) return;
    const sec = sections.find((s) => s._id === task.sectionId);
    if (sec?.type !== "recurring") return;

    const migrated = migrateLegacyHubBody(environment.items, page.id, task._id);
    if (migrated.migrated) {
      setAndPersist(() => ({ items: migrated.items }));
    }
  }, [selectedPageId, environment.items, tasks, sections, setAndPersist]);

  useEffect(() => {
    setOpenPageIds((prev) => {
      const next = Array.from({ length: paneCount }, (_, i) => prev[i] ?? null);
      return next;
    });
    setEditingByPane((prev) =>
      Array.from({ length: paneCount }, (_, i) => prev[i] ?? (i === 0))
    );
    setActivePaneIndex((idx) => Math.min(idx, paneCount - 1));
  }, [paneCount]);

  const visiblePages = useMemo(
    () => buildVisibleList(environment.items, collapsedIds),
    [environment.items, collapsedIds]
  );
  const sortableIds = useMemo(() => visiblePages.map((p) => p.id), [visiblePages]);

  const getPage = useCallback(
    (id: string | null) => (id ? environment.items.find((p) => p.id === id) ?? null : null),
    [environment.items]
  );

  const openPageInActivePane = useCallback(
    (id: string) => {
      setSelectedPageId(id);
      setOpenPageIds((prev) => {
        const next = [...prev];
        next[activePaneIndex] = id;
        return next;
      });
    },
    [activePaneIndex]
  );

  const addPage = useCallback(
    (parentId: string | null = null) => {
      const siblings = environment.items
        .filter((p) => p.parentId === parentId)
        .sort((a, b) => a.order - b.order);
      const parent = parentId ? environment.items.find((p) => p.id === parentId) ?? null : null;
      const page: MarkdownPageItem = {
        id: newId(),
        title: parent ? "Child page" : "Page",
        body: serializePageDocument(emptyPageDocument()),
        linkedTaskId: parent?.linkedTaskId ?? null,
        parentId,
        depth: parent ? parent.depth + 1 : 0,
        order: siblings.length,
      };
      setAndPersist((prev) => ({ ...prev, items: [...prev.items, page] }));
      if (parentId) {
        setCollapsedIds((prev) => {
          if (!prev.has(parentId)) return prev;
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
      openPageInActivePane(page.id);
      setEditingByPane((prev) => {
        const next = [...prev];
        next[activePaneIndex] = true;
        return next;
      });
    },
    [environment.items, setAndPersist, openPageInActivePane, activePaneIndex]
  );

  const updatePage = useCallback(
    (id: string, patch: Partial<MarkdownPageItem>) => {
      setAndPersist((prev) => ({
        ...prev,
        items: prev.items.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
    },
    [setAndPersist]
  );

  const removePage = useCallback(
    (id: string) => {
      setAndPersist((prev) => {
        const idsToDelete = new Set<string>([id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const page of prev.items) {
            if (page.parentId && idsToDelete.has(page.parentId) && !idsToDelete.has(page.id)) {
              idsToDelete.add(page.id);
              changed = true;
            }
          }
        }
        const remaining = prev.items.filter((p) => !idsToDelete.has(p.id));
        const byParent = new Map<string | null, MarkdownPageItem[]>();
        for (const item of remaining) {
          const arr = byParent.get(item.parentId) ?? [];
          arr.push(item);
          byParent.set(item.parentId, arr);
        }
        for (const [pid, arr] of byParent.entries()) {
          arr
            .sort((a, b) => a.order - b.order)
            .forEach((p, i) => {
              p.order = i;
              if (pid === null) p.depth = 0;
            });
        }
        return { ...prev, items: remaining };
      });
      setOpenPageIds((prev) => prev.map((pid) => (pid === id ? null : pid)));
      setSelectedPageId((cur) => (cur === id ? null : cur));
    },
    [setAndPersist]
  );

  const applyReorder = useCallback(
    (updates: { id: string; parentId: string | null; depth: number; order: number }[]) => {
      if (!updates.length) return;
      setAndPersist((prev) => ({
        ...prev,
        items: prev.items.map((p) => {
          const upd = updates.find((u) => u.id === p.id);
          return upd ? { ...p, ...upd } : p;
        }),
      }));
    },
    [setAndPersist]
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    hoverTargetRef.current = null;
    hoverStartRef.current = null;
  }, []);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      hoverTargetRef.current = null;
      hoverStartRef.current = null;
      return;
    }
    const overId = String(over.id);
    if (overId.startsWith(PAGE_NEST_BELOW_PREFIX)) {
      if (hoverTargetRef.current !== overId) {
        hoverTargetRef.current = overId;
        hoverStartRef.current = Date.now();
      }
    } else {
      hoverTargetRef.current = null;
      hoverStartRef.current = null;
    }
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const hoverTargetId = hoverTargetRef.current;
      const hoverStartTs = hoverStartRef.current;
      hoverTargetRef.current = null;
      hoverStartRef.current = null;
      setActiveDragId(null);
      if (!over || active.id === over.id) return;

      const activePage = environment.items.find((p) => p.id === String(active.id));
      if (!activePage) return;
      const overId = String(over.id);

      if (overId.startsWith(PAGE_NEST_BELOW_PREFIX)) {
        const anchorId = overId.slice(PAGE_NEST_BELOW_PREFIX.length);
        if (anchorId === activePage.id) return;
        const anchorPage = environment.items.find((p) => p.id === anchorId);
        if (!anchorPage) return;
        const hoveredLongEnough =
          hoverTargetId === overId &&
          hoverStartTs !== null &&
          Date.now() - hoverStartTs >= NEST_HOVER_MS;
        if (hoveredLongEnough) {
          const updates = computePageNestMove(environment.items, activePage, anchorPage);
          if (updates?.length) {
            applyReorder(updates);
            setCollapsedIds((prev) => {
              if (!prev.has(anchorPage.id)) return prev;
              const next = new Set(prev);
              next.delete(anchorPage.id);
              return next;
            });
          }
        } else {
          const updates = computePageSiblingMoveAfter(environment.items, activePage, anchorPage);
          if (updates?.length) applyReorder(updates);
        }
        return;
      }

      const overPage = environment.items.find((p) => p.id === overId);
      if (!overPage) return;
      const updates = computePageSiblingMove(environment.items, activePage, overPage);
      if (updates?.length) applyReorder(updates);
    },
    [environment.items, applyReorder]
  );

  const linkPickerTasksByPageId = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    for (const pid of openPageIds) {
      if (!pid) continue;
      const p = environment.items.find((x) => x.id === pid);
      if (!p) continue;
      m.set(pid, orderTasksForPageLinkPicker(tasks, sections, p.linkedTaskId ?? null));
    }
    return m;
  }, [openPageIds, environment.items, tasks, sections]);

  const panes = openPageIds.map((id) => getPage(id));
  const activePage = panes[activePaneIndex] ?? null;
  const activeEditing = editingByPane[activePaneIndex] ?? false;
  const activeMobileMenu: MobileMenuKey | null = useMemo(() => {
    if (!isNarrowPagesLayout) return null;
    if (!tasksPanelCollapsed) return "tasks";
    if (narrowMobileToolbarOpen) return "toolbar";
    if (!mobilePaneMetaCollapsed) return "meta";
    if (mobileLayoutMenuOpen) return "layout";
    return null;
  }, [
    isNarrowPagesLayout,
    tasksPanelCollapsed,
    narrowMobileToolbarOpen,
    mobilePaneMetaCollapsed,
    mobileLayoutMenuOpen,
  ]);
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

  useEffect(() => {
    if (selectedTaskId && !tasks.some((t) => t._id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [tasks, selectedTaskId]);

  const createTaskFromPage = useCallback(
    async (page: MarkdownPageItem) => {
      const rootTask = page.linkedTaskId
        ? tasks.find((t) => t._id === page.linkedTaskId) ?? null
        : null;
      const rootSection = rootTask
        ? sections.find((s) => s._id === rootTask.sectionId) ?? null
        : null;
      const fallbackSection = sections[0] ?? null;
      const targetSection = rootSection ?? fallbackSection;
      if (!targetSection) {
        alert("Create a section first, then add a task.");
        return;
      }

      const parentId = rootTask ? rootTask._id : null;
      const depth = rootTask ? rootTask.depth + 1 : 0;
      const created = await createTask(
        targetSection._id,
        parentId,
        depth,
        targetSection.type
      );

      if (!page.linkedTaskId) {
        updatePage(page.id, { linkedTaskId: created._id });
      }
      setSelectedTaskId(created._id);
    },
    [tasks, sections, createTask, updatePage]
  );

  const closeMobileMenu = useCallback(() => {
    setMobileLayoutMenuOpen(false);
    setMobilePaneMetaCollapsed(true);
    setNarrowMobileToolbarOpen(false);
    setTasksPanelCollapsedSafe(true);
  }, [setTasksPanelCollapsedSafe]);

  const openMobileMenu = useCallback(
    (menu: MobileMenuKey) => {
      if (menu === "layout") {
        setMobileLayoutMenuOpen(true);
        setMobilePaneMetaCollapsed(true);
        setNarrowMobileToolbarOpen(false);
        setTasksPanelCollapsedSafe(true);
        return;
      }
      if (menu === "meta") {
        setMobileLayoutMenuOpen(false);
        setMobilePaneMetaCollapsed(false);
        setNarrowMobileToolbarOpen(false);
        setTasksPanelCollapsedSafe(true);
        return;
      }
      if (menu === "toolbar") {
        setMobileLayoutMenuOpen(false);
        setMobilePaneMetaCollapsed(true);
        setNarrowMobileToolbarOpen(true);
        setTasksPanelCollapsedSafe(true);
        return;
      }
      ignoreTasksPanelCloseUntilRef.current = Date.now() + 1200;
      setMobileLayoutMenuOpen(false);
      setMobilePaneMetaCollapsed(true);
      setNarrowMobileToolbarOpen(false);
      setTasksPanelCollapsed(false);
    },
    [setTasksPanelCollapsedSafe]
  );

  const toggleMobileMenu = useCallback(
    (menu: MobileMenuKey) => {
      if (activeMobileMenu === menu) {
        closeMobileMenu();
        return;
      }
      openMobileMenu(menu);
    },
    [activeMobileMenu, closeMobileMenu, openMobileMenu]
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-muted)" }}>Loading...</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", maxHeight: "100vh", overflow: "hidden" }}>
      <aside
        aria-hidden={sidebarHidden}
        style={{
          width: sidebarHidden ? 0 : 320,
          minWidth: sidebarHidden ? 0 : 320,
          maxWidth: sidebarHidden ? 0 : 320,
          flexShrink: 0,
          borderRight: sidebarHidden ? "none" : "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          overflow: sidebarHidden ? "hidden" : "auto",
          transition: isNarrowPagesLayout
            ? "width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease"
            : undefined,
          pointerEvents: sidebarHidden ? "none" : undefined,
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <AppNavTasksPages active="pages" />
            </div>
            {isNarrowPagesLayout && (
              <button
                type="button"
                onClick={() => setPagesSidebarMinimized(true)}
                title="Minimize pages panel"
                aria-label="Minimize pages panel"
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  padding: 0,
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                <ChevronLeft size={18} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => addPage(null)} style={{ fontSize: 12 }}>
              Add root page
            </button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div style={{ padding: "8px 0" }}>
              {visiblePages.map((page) => (
                <React.Fragment key={page.id}>
                  <PageNavRow
                    page={page}
                    selected={selectedPageId === page.id}
                    collapsed={collapsedIds.has(page.id)}
                    hasChildren={environment.items.some((x) => x.parentId === page.id)}
                    onSelect={() => {
                      openPageInActivePane(page.id);
                    }}
                    onToggleCollapse={() =>
                      setCollapsedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(page.id)) next.delete(page.id);
                        else next.add(page.id);
                        return next;
                      })
                    }
                    onAddChild={() => addPage(page.id)}
                    isDragging={activeDragId === page.id}
                  />
                  <PageNestDropZone pageId={page.id} />
                </React.Fragment>
              ))}
              {visiblePages.length === 0 && (
                <div style={{ padding: "8px 16px", color: "var(--text-muted)", fontStyle: "italic" }}>
                  No pages yet.
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {isNarrowPagesLayout ? (
          <>
            <div
              style={{
                flexShrink: 0,
                padding: "6px 10px",
                borderBottom: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                alignItems: "center",
                gap: 8,
                overflowX: "auto",
                overflowY: "hidden",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setPagesSidebarMinimized(false);
                  closeMobileMenu();
                }}
                title="Pages list"
                aria-label="Pages list"
                style={mobileIconBtnStyle(!sidebarHidden)}
              >
                <FileText size={20} />
              </button>
              <button
                type="button"
                onClick={() => toggleMobileMenu("layout")}
                title="Panes and layout"
                aria-label="Panes and layout"
                style={mobileIconBtnStyle(activeMobileMenu === "layout")}
              >
                <LayoutGrid size={20} />
              </button>
              {activePage && (
                <button
                  type="button"
                  onClick={() => toggleMobileMenu("meta")}
                  title="Page title and root task"
                  aria-label="Page title and root task"
                  style={mobileIconBtnStyle(activeMobileMenu === "meta")}
                >
                  <Menu size={20} />
                </button>
              )}
              {activePage && activeEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => toggleMobileMenu("toolbar")}
                    title="Formatting and link to task"
                    aria-label="Formatting and link to task"
                    style={mobileIconBtnStyle(activeMobileMenu === "toolbar")}
                  >
                    <Pencil size={20} />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMobileMenu("tasks");
                    }}
                    title="Linked tasks"
                    aria-label="Linked tasks"
                    style={mobileIconBtnStyle(activeMobileMenu === "tasks")}
                  >
                    <Check size={20} />
                  </button>
                </>
              )}
            </div>
            {activeMobileMenu === "layout" && (
              <div
                style={{
                  flexShrink: 0,
                  padding: "6px 10px 8px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  display: "flex",
                  gap: 6,
                  overflowX: "auto",
                  overflowY: "hidden",
                }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPaneCount(n as 1 | 2 | 3 | 4)}
                    style={{
                      minWidth: 38,
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border-color)",
                      background: paneCount === n ? "var(--bg-tertiary)" : "transparent",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {sidebarHidden && (
              <div
                style={{
                  flexShrink: 0,
                  padding: isNarrowPagesLayout ? "6px 10px" : "10px 16px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {isNarrowPagesLayout ? (
                  <button
                    type="button"
                    onClick={() => setPagesSidebarMinimized(false)}
                    title="Pages list"
                    aria-label="Pages list"
                    style={mobileIconBtn}
                  >
                    <FileText size={20} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setPagesSidebarMinimized(false)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
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
                      <ChevronRight size={16} />
                      Pages list
                    </button>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Open the tree to switch pages
                    </span>
                  </>
                )}
              </div>
            )}
            <header
              style={{
                borderBottom: "1px solid var(--border-color)",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: isNarrowPagesLayout ? 17 : 20 }}>Pages</h1>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {(!isNarrowPagesLayout || activeMobileMenu === "layout") &&
                  [1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPaneCount(n as 1 | 2 | 3 | 4)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border-color)",
                        background: paneCount === n ? "var(--bg-tertiary)" : "transparent",
                      }}
                    >
                      {n}
                    </button>
                  ))}
              </div>
            </header>
          </>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: paneCount === 1 ? "1fr" : paneCount === 2 ? "1fr 1fr" : "1fr 1fr",
            gridTemplateRows: paneCount <= 2 ? "1fr" : "1fr 1fr",
          }}
        >
          {Array.from({ length: paneCount }).map((_, paneIdx) => {
            const page = panes[paneIdx];
            const editing = editingByPane[paneIdx] ?? false;
            const linkTaskOptions = page
              ? linkPickerTasksByPageId.get(page.id) ?? []
              : [];
            const recurringHubTask =
              page &&
              page.linkedTaskId &&
              (() => {
                const t = tasks.find((tk) => tk._id === page.linkedTaskId);
                if (!t || t.recurringNotesPageId !== page.id) return null;
                const sec = sections.find((s) => s._id === t.sectionId);
                if (sec?.type !== "recurring") return null;
                return t;
              })();
            return (
              <section
                key={paneIdx}
                onClick={() => {
                  if (paneIdx !== activePaneIndex) {
                    setActivePaneIndex(paneIdx);
                  }
                }}
                style={{
                  borderRight: paneIdx % 2 === 0 && paneCount > 1 ? "1px solid var(--border-subtle)" : "none",
                  borderBottom: paneIdx < 2 && paneCount > 2 ? "1px solid var(--border-subtle)" : "none",
                  minWidth: 0,
                  minHeight: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  background: activePaneIndex === paneIdx ? "rgba(59,130,246,0.03)" : "transparent",
                }}
              >
                {page && isNarrowPagesLayout && mobilePaneMetaCollapsed ? null : (
                <div
                  style={{
                    flexShrink: 0,
                    position: "sticky",
                    top: 0,
                    zIndex: 25,
                    borderBottom: "1px solid var(--border-subtle)",
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: isNarrowPagesLayout ? "column" : "row",
                    alignItems: isNarrowPagesLayout ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: 8,
                    background: "var(--bg-primary)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      minWidth: 0,
                      flex: isNarrowPagesLayout ? undefined : 1,
                      width: isNarrowPagesLayout ? "100%" : undefined,
                    }}
                  >
                    {page ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isNarrowPagesLayout ? "1fr" : "1fr auto",
                          gap: 8,
                        }}
                      >
                        <input
                          value={page.title}
                          onChange={(e) => updatePage(page.id, { title: e.target.value })}
                          style={{
                            width: "100%",
                            minWidth: 0,
                            border: "1px solid var(--border-color)",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: 13,
                          }}
                        />
                        <select
                          value={page.linkedTaskId ?? ""}
                          onChange={(e) => {
                            const nextTaskId = e.target.value || null;
                            updatePage(page.id, {
                              linkedTaskId: nextTaskId,
                            });
                          }}
                          title="Link page to root task"
                          style={{
                            fontSize: 12,
                            maxWidth: isNarrowPagesLayout ? "100%" : 190,
                            width: isNarrowPagesLayout ? "100%" : undefined,
                            minWidth: 0,
                          }}
                        >
                          <option value="">No root task</option>
                          {tasks.map((t) => {
                            const sec = sections.find((s) => s._id === t.sectionId);
                            const prefix = sec ? `${sec.title} / ` : "";
                            return (
                              <option key={t._id} value={t._id}>
                                {prefix}
                                {t.title.trim() || "Untitled"}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            void createTaskFromPage(page);
                          }}
                          title="Create a new task for this page"
                          style={{
                            fontSize: 12,
                            maxWidth: isNarrowPagesLayout ? "100%" : 140,
                            width: isNarrowPagesLayout ? "100%" : undefined,
                            minWidth: 0,
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--border-color)",
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          New task
                        </button>
                      </div>
                    ) : (
                      "Empty pane"
                    )}
                  </div>
                  {page && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignSelf: isNarrowPagesLayout ? "flex-end" : undefined,
                        flexShrink: 0,
                      }}
                    >
                      {isNarrowPagesLayout && editing && (
                        <button
                          type="button"
                          title="Linked tasks"
                          aria-label="Linked tasks"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            ignoreTasksPanelCloseUntilRef.current = Date.now() + 1200;
                            setTasksPanelCollapsed(false);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            ignoreTasksPanelCloseUntilRef.current = Date.now() + 1200;
                            setTasksPanelCollapsed(false);
                          }}
                          style={{
                            border: "1px solid var(--border-color)",
                            borderRadius: 6,
                            background: tasksPanelCollapsed ? "transparent" : "var(--bg-tertiary)",
                            padding: 6,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Check size={18} />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() =>
                          setEditingByPane((prev) => {
                            const next = [...prev];
                            next[paneIdx] = true;
                            return next;
                          })
                        }
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 6,
                          background: editing ? "var(--bg-tertiary)" : "transparent",
                          padding: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        title="Preview"
                        aria-label="Preview"
                        onClick={() =>
                          setEditingByPane((prev) => {
                            const next = [...prev];
                            next[paneIdx] = false;
                            return next;
                          })
                        }
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 6,
                          background: !editing ? "var(--bg-tertiary)" : "transparent",
                          padding: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        type="button"
                        title="Delete page"
                        aria-label="Delete page"
                        onClick={() => removePage(page.id)}
                        style={{
                          border: "1px solid rgba(220, 38, 38, 0.3)",
                          borderRadius: 6,
                          background: "transparent",
                          color: "var(--accent-red)",
                          padding: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  )}
                </div>
                )}

                {!page ? (
                  <div style={{ padding: 16, color: "var(--text-muted)", fontStyle: "italic" }}>
                    Select a page from the left panel.
                  </div>
                ) : recurringHubTask ? (
                  <>
                    <RecurringNotesAggregateView
                      hubTitle={page.title}
                      hubId={page.id}
                      items={environment.items}
                      sortOrder={recurringHubSortOrder}
                      onSortOrderChange={setRecurringHubSortOrder}
                      onSaveDayPagePlain={(pageId, plainText) =>
                        updatePage(pageId, {
                          body: pageBodyFromPlainText(plainText),
                        })
                      }
                      onOpenDayPage={(id) => openPageInActivePane(id)}
                    />
                    <div
                      style={{
                        padding: 16,
                        color: "var(--text-muted)",
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      Day notes save automatically. Child pages also appear in the sidebar under
                      this hub.
                    </div>
                  </>
                ) : (
                  <PageBlockEditor
                    key={`${paneIdx}-${page.id}`}
                    pageId={page.id}
                    body={page.body}
                    onChange={(serialized) => updatePage(page.id, { body: serialized })}
                    editing={editing}
                    layoutNarrow={isNarrowPagesLayout}
                    linkTaskOptions={linkTaskOptions}
                    pageLinkedRootTaskId={page.linkedTaskId ?? null}
                    tasks={tasks}
                    sections={sections}
                    updateTask={updateTask}
                    tasksPanelCollapsed={tasksPanelCollapsed}
                    onTasksPanelCollapsedChange={setTasksPanelCollapsedSafe}
                    narrowMobileToolbarOpen={narrowMobileToolbarOpen}
                    onNarrowMobileToolbarOpenChange={setNarrowMobileToolbarOpen}
                  />
                )}
              </section>
            );
          })}
        </div>
      </main>
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
          tasks={tasks}
          reorderTasks={reorderTasks}
          createTask={createTask}
          onNavigateToTask={(id) => setSelectedTaskId(id)}
        />
      )}
    </div>
  );
}

function PageNavRow({
  page,
  selected,
  collapsed,
  hasChildren,
  onSelect,
  onToggleCollapse,
  onAddChild,
  isDragging,
}: {
  page: MarkdownPageItem;
  selected: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
  onAddChild: () => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: page.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
      }}
    >
      <div
        style={{
          padding: `4px 10px 4px ${10 + page.depth * 14}px`,
          minHeight: 28,
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: selected ? "rgba(59,130,246,0.12)" : "transparent",
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ width: 22, height: 22, border: "none", background: "transparent" }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <span style={{ width: 22 }} />
        )}

        <button
          type="button"
          onClick={onSelect}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "transparent",
            textAlign: "left",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          {page.title.trim() || "Untitled"}
        </button>

        <button
          type="button"
          onClick={onAddChild}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ border: "none", background: "transparent" }}
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

function PageNestDropZone({ pageId }: { pageId: string }) {
  const id = nestBelowId(pageId);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "page-nest-below", pageId },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        height: 12,
        marginTop: -3,
        marginBottom: -3,
        borderRadius: 4,
        ...(isOver
          ? {
              background: "rgba(75, 156, 245, 0.18)",
              boxShadow: "inset 0 0 0 1px rgba(75, 156, 245, 0.35)",
            }
          : {}),
      }}
    />
  );
}
