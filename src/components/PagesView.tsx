"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
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
  ChevronRight,
  Eye,
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
import { emptyPageDocument, parsePageBody, serializePageDocument } from "@/lib/pageDocument";
import { orderTasksForPageLinkPicker } from "@/lib/pageTaskPickerOrder";

const NEST_HOVER_MS = 1200;
const PAGE_NEST_BELOW_PREFIX = "page-nest-below-";

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
  const { tasks, updateTask } = useTasks();
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

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
        setEnvironment(normalized);
        if (normalized.items.length > 0) {
          const preferred =
            initialPageId && normalized.items.some((p) => p.id === initialPageId)
              ? initialPageId
              : normalized.items[0].id;
          setSelectedPageId(preferred);
          setOpenPageIds([preferred]);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [initialPageId, initialTaskId]);

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
        style={{
          width: 320,
          borderRight: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          overflow: "auto",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
            <Link href="/" style={{ color: "var(--accent-blue)" }}>
              Tasks
            </Link>{" "}
            / <strong>Pages</strong>
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
        <header
          style={{
            borderBottom: "1px solid var(--border-color)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20 }}>Pages</h1>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4].map((n) => (
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
                <div
                  style={{
                    flexShrink: 0,
                    position: "sticky",
                    top: 0,
                    zIndex: 25,
                    borderBottom: "1px solid var(--border-subtle)",
                    padding: "8px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    background: "var(--bg-primary)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0, flex: 1 }}>
                    {page ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
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
                          style={{ fontSize: 12, maxWidth: 190 }}
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
                      </div>
                    ) : (
                      "Empty pane"
                    )}
                  </div>
                  {page && (
                    <div style={{ display: "flex", gap: 6 }}>
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

                {!page ? (
                  <div style={{ padding: 16, color: "var(--text-muted)", fontStyle: "italic" }}>
                    Select a page from the left panel.
                  </div>
                ) : (
                  <PageBlockEditor
                    key={`${paneIdx}-${page.id}`}
                    pageId={page.id}
                    body={page.body}
                    onChange={(serialized) => updatePage(page.id, { body: serialized })}
                    editing={editing}
                    linkTaskOptions={linkTaskOptions}
                    pageLinkedRootTaskId={page.linkedTaskId ?? null}
                    tasks={tasks}
                    sections={sections}
                    updateTask={updateTask}
                  />
                )}
              </section>
            );
          })}
        </div>
      </main>
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
