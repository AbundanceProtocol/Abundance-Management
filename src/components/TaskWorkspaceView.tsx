"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useTasks, useSections } from "@/lib/hooks";
import { TaskItem } from "@/lib/types";
import { filterSubtreeTasks } from "@/lib/taskSubtree";
import { filterTasksForMainView } from "@/lib/recurrence";
import { buildVisibleTaskTree, coerceTopLevelSort } from "@/lib/timelineUtils";
import {
  TaskWorkspaceState,
  WorkspaceCanvasItem,
  WorkspaceItemLinkRole,
  DEFAULT_WORKSPACE,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_VIDEO_SIZE,
  DEFAULT_MARKDOWN_SIZE,
} from "@/lib/workspaceTypes";
import { normalizeWorkspace } from "@/lib/workspaceNormalize";
import { getActiveTodayFocusYmd } from "@/lib/todayFocus";
import {
  WORLD_CANVAS_SIZE,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  clampZoom,
  clientToWorld,
  viewportCenterWorld,
  snapToGrid,
  zoomAtViewportPoint,
} from "@/lib/workspaceCanvas";
import {
  classifyMediaUrl,
  extractHttpUrl,
  normalizeDropboxDirectUrl,
} from "@/lib/mediaUrl";
import {
  Trash,
  ChevronRight,
  ChevronDown,
  GripVertical,
  FileText,
  Link as LinkIcon,
  Plus,
} from "./Icons";
import DeleteWorkspaceArtifactModal from "./DeleteWorkspaceArtifactModal";
import TaskNotesModal from "./TaskNotesModal";
import TaskDetailPanel from "./TaskDetailPanel";
import {
  MobileAppMenuCollapsedBar,
  MobileAppMenuCollapseButton,
} from "./MobileAppMenu";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nextStaggerPosition(
  items: WorkspaceCanvasItem[],
  defaults: { width: number; height: number }
): { x: number; y: number } {
  const n = items.length;
  const col = n % 5;
  const row = Math.floor(n / 5);
  return {
    x: 40 + col * 36,
    y: 40 + row * 36,
  };
}

function extractUrlFromDrop(dt: DataTransfer): string | null {
  const uri =
    dt.getData("text/uri-list")?.split("\n")[0]?.trim() ||
    dt.getData("text/plain")?.trim();
  if (uri && /^https?:\/\//i.test(uri)) return uri;
  return null;
}

function PlayOverlay({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
    >
      <circle cx="24" cy="24" r="22" fill="rgba(0,0,0,0.55)" />
      <path
        d="M20 16l14 8-14 8V16z"
        fill="white"
        fillOpacity={0.95}
      />
    </svg>
  );
}

type MarkdownPageTreeNode = {
  item: Extract<WorkspaceCanvasItem, { type: "markdown" }>;
  children: MarkdownPageTreeNode[];
};

function asMarkdownItem(
  item: WorkspaceCanvasItem
): Extract<WorkspaceCanvasItem, { type: "markdown" }> | null {
  return item.type === "markdown" ? item : null;
}

function buildMarkdownPageTree(items: WorkspaceCanvasItem[]): MarkdownPageTreeNode[] {
  const markdownItems = items
    .map((it) => asMarkdownItem(it))
    .filter((it): it is Extract<WorkspaceCanvasItem, { type: "markdown" }> => Boolean(it));
  const byId = new Map(markdownItems.map((it) => [it.id, it]));
  const childrenByParent = new Map<string | null, string[]>();

  for (const item of markdownItems) {
    const parentId =
      item.parentMarkdownId && byId.has(item.parentMarkdownId)
        ? item.parentMarkdownId
        : null;
    const arr = childrenByParent.get(parentId) ?? [];
    arr.push(item.id);
    childrenByParent.set(parentId, arr);
  }

  const buildNode = (id: string): MarkdownPageTreeNode => {
    const item = byId.get(id)!;
    const childIds = childrenByParent.get(id) ?? [];
    return {
      item,
      children: childIds.map(buildNode),
    };
  };

  return (childrenByParent.get(null) ?? []).map(buildNode);
}

export default function TaskWorkspaceView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const { sections, loading: sectionsLoading } = useSections();
  const {
    tasks,
    loading: tasksLoading,
    updateTask,
    duplicateTaskWithSubtree,
    createTask,
    reorderTasks,
  } = useTasks();

  const [workspace, setWorkspace] = useState<TaskWorkspaceState>(
    DEFAULT_WORKSPACE
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [mobileTasksOpen, setMobileTasksOpen] = useState(false);
  const [mobileWorkspaceMenuOpen, setMobileWorkspaceMenuOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  /** Sidebar-only: which task ids have their nested rows hidden (independent of board collapse). */
  const [sidebarCollapsedIds, setSidebarCollapsedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingDeleteArtifactId, setPendingDeleteArtifactId] = useState<
    string | null
  >(null);
  const [collapsedMarkdownIds, setCollapsedMarkdownIds] = useState<Set<string>>(
    () => new Set()
  );
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [noteModalTaskId, setNoteModalTaskId] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const hydratedRef = useRef(false);

  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    zoomRef.current = canvasZoom;
  }, [canvasZoom]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!isNarrow) setMobileWorkspaceMenuOpen(false);
  }, [isNarrow]);

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

  const baseList = useMemo(
    () => filterTasksForMainView(subtreeTasks, true),
    [subtreeTasks]
  );

  const childCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of baseList) {
      if (t.parentId) {
        map[t.parentId] = (map[t.parentId] || 0) + 1;
      }
    }
    return map;
  }, [baseList]);

  const flatTasks = useMemo(() => {
    if (!anchor || !section) return [];
    const rest = buildVisibleTaskTree(
      baseList,
      anchor._id,
      sidebarCollapsedIds,
      coerceTopLevelSort(section.topLevelSort ?? "manual")
    );
    return [anchor, ...rest];
  }, [anchor, section, baseList, sidebarCollapsedIds]);

  const linkableTasks = useMemo(
    () =>
      flatTasks.map((t) => ({
        id: t._id,
        label: t.title.trim() || "Untitled",
      })),
    [flatTasks]
  );

  const taskLinkCounts = useMemo(() => {
    const map: Record<string, { assets: number; finals: number }> = {};
    for (const it of workspace.items) {
      const tid = it.linkedTaskId;
      if (!tid) continue;
      if (!map[tid]) map[tid] = { assets: 0, finals: 0 };
      if (it.linkRole === "final") map[tid].finals += 1;
      else map[tid].assets += 1;
    }
    return map;
  }, [workspace.items]);

  const markdownPages = useMemo(
    () => workspace.items.filter((it) => it.type === "markdown"),
    [workspace.items]
  );

  const markdownPageTree = useMemo(
    () => buildMarkdownPageTree(workspace.items),
    [workspace.items]
  );

  const pendingArtifactLabel = useMemo(() => {
    if (!pendingDeleteArtifactId) return "";
    const it = workspace.items.find((i) => i.id === pendingDeleteArtifactId);
    if (!it) return "";
    const t = it.title?.trim();
    if (t) return t;
    if (it.type === "image") return "Image";
    if (it.type === "video") return "Video";
    return "Markdown note";
  }, [pendingDeleteArtifactId, workspace.items]);

  const detailTask = useMemo(
    () =>
      detailTaskId
        ? tasks.find((t) => t._id === detailTaskId) ?? null
        : null,
    [tasks, detailTaskId]
  );

  const detailTaskSection = useMemo(
    () =>
      detailTask
        ? sections.find((s) => s._id === detailTask.sectionId) ?? null
        : null,
    [sections, detailTask]
  );

  const noteModalTask = useMemo(
    () =>
      noteModalTaskId
        ? tasks.find((t) => t._id === noteModalTaskId) ?? null
        : null,
    [tasks, noteModalTaskId]
  );

  const openTaskDetails = useCallback((task: TaskItem) => {
    setDetailTaskId(task._id);
    setMobileTasksOpen(false);
  }, []);

  const handleDuplicateTask = useCallback(async () => {
    if (!detailTaskId) return;
    setDuplicateBusy(true);
    try {
      const anchorWasDuplicated = detailTaskId === taskId;
      const newRootId = await duplicateTaskWithSubtree(detailTaskId);
      if (anchorWasDuplicated) {
        router.replace(`/task/${newRootId}/workspace`);
      } else {
        setDetailTaskId(newRootId);
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setDuplicateBusy(false);
    }
  }, [detailTaskId, taskId, duplicateTaskWithSubtree, router]);

  useEffect(() => {
    if (detailTaskId && !tasks.some((t) => t._id === detailTaskId)) {
      setDetailTaskId(null);
    }
  }, [tasks, detailTaskId]);

  useEffect(() => {
    if (noteModalTaskId && !tasks.some((t) => t._id === noteModalTaskId)) {
      setNoteModalTaskId(null);
    }
  }, [tasks, noteModalTaskId]);

  useEffect(() => {
    hydratedRef.current = false;
    setWorkspace(DEFAULT_WORKSPACE);
    setSidebarCollapsedIds(new Set());
    setCanvasZoom(1);
    setCanvasPan({ x: 0, y: 0 });
    setPendingDeleteArtifactId(null);
    setCollapsedMarkdownIds(new Set());
    setDetailTaskId(null);
    setNoteModalTaskId(null);
  }, [taskId]);

  useEffect(() => {
    if (!anchor || hydratedRef.current) return;
    setWorkspace(
      anchor.workspace
        ? normalizeWorkspace(anchor.workspace)
        : DEFAULT_WORKSPACE
    );
    hydratedRef.current = true;
  }, [anchor, taskId, tasks]);

  const scheduleSave = useCallback(
    (next: TaskWorkspaceState) => {
      if (!anchor) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void updateTask({ _id: anchor._id, workspace: next });
      }, 550);
    },
    [anchor, updateTask]
  );

  const setAndPersist = useCallback(
    (updater: (w: TaskWorkspaceState) => TaskWorkspaceState) => {
      setWorkspace((prev) => {
        const next = updater(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const addMediaAt = useCallback(
    (rawUrl: string, clientX: number, clientY: number) => {
      const url = normalizeDropboxDirectUrl(rawUrl);
      const kind = classifyMediaUrl(url);
      const vp = viewportRef.current;
      const defaults =
        kind === "video" ? DEFAULT_VIDEO_SIZE : DEFAULT_IMAGE_SIZE;
      let x = 40;
      let y = 40;
      if (vp) {
        const w = clientToWorld(clientX, clientY, vp, canvasPan, canvasZoom);
        x = snapToGrid(Math.max(0, w.x - defaults.width / 2));
        y = snapToGrid(Math.max(0, w.y - defaults.height / 2));
      } else {
        const pos = nextStaggerPosition(workspace.items, defaults);
        x = snapToGrid(pos.x);
        y = snapToGrid(pos.y);
      }

      const id = newId();
      if (kind === "video") {
        const item: WorkspaceCanvasItem = {
          id,
          type: "video",
          url,
          title: "Video",
          x,
          y,
          width: snapToGrid(DEFAULT_VIDEO_SIZE.width),
          height: snapToGrid(DEFAULT_VIDEO_SIZE.height),
          linkedTaskId: null,
          linkRole: null,
        };
        setAndPersist((w) => ({ ...w, items: [...w.items, item] }));
        setSelectedId(id);
        return;
      }
      const item: WorkspaceCanvasItem = {
        id,
        type: "image",
        url,
        title: "Image",
        x,
        y,
        width: snapToGrid(DEFAULT_IMAGE_SIZE.width),
        height: snapToGrid(DEFAULT_IMAGE_SIZE.height),
        linkedTaskId: null,
        linkRole: null,
      };
      setAndPersist((w) => ({ ...w, items: [...w.items, item] }));
      setSelectedId(id);
    },
    [setAndPersist, workspace.items, canvasPan, canvasZoom]
  );

  const addMarkdownFrame = useCallback((parentMarkdownId: string | null = null) => {
    const vp = viewportRef.current;
    let x = 40;
    let y = 40;
    const parent = parentMarkdownId
      ? workspace.items.find(
          (it) => it.type === "markdown" && it.id === parentMarkdownId
        ) ?? null
      : null;
    if (parent) {
      x = snapToGrid(Math.max(0, parent.x + 36));
      y = snapToGrid(Math.max(0, parent.y + 36));
    } else if (vp) {
      const c = viewportCenterWorld(vp, canvasPan, canvasZoom);
      x = snapToGrid(
        Math.max(0, c.x - DEFAULT_MARKDOWN_SIZE.width / 2)
      );
      y = snapToGrid(
        Math.max(0, c.y - DEFAULT_MARKDOWN_SIZE.height / 2)
      );
    } else {
      const pos = nextStaggerPosition(workspace.items, DEFAULT_MARKDOWN_SIZE);
      x = snapToGrid(pos.x);
      y = snapToGrid(pos.y);
    }
    const id = newId();
    const item: WorkspaceCanvasItem = {
      id,
      type: "markdown",
      title: parent ? "Child page" : "Page",
      body: parent ? "### Child page\n\nWrite here..." : "### Page\n\nWrite here...",
      x,
      y,
      width: snapToGrid(DEFAULT_MARKDOWN_SIZE.width),
      height: snapToGrid(DEFAULT_MARKDOWN_SIZE.height),
      linkedTaskId: null,
      linkRole: null,
      parentMarkdownId,
    };
    setAndPersist((w) => ({ ...w, items: [...w.items, item] }));
    setSelectedId(id);
    if (parentMarkdownId) {
      setCollapsedMarkdownIds((prev) => {
        if (!prev.has(parentMarkdownId)) return prev;
        const next = new Set(prev);
        next.delete(parentMarkdownId);
        return next;
      });
    }
  }, [setAndPersist, workspace.items, canvasPan, canvasZoom]);

  const onCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const url = extractUrlFromDrop(e.dataTransfer);
      if (url) addMediaAt(url, e.clientX, e.clientY);
    },
    [addMediaAt]
  );

  useEffect(() => {
    const onWinPaste = (e: ClipboardEvent) => {
      const el = viewportRef.current;
      if (!el) return;
      const ae = document.activeElement;
      if (ae !== el && !el.contains(ae)) return;
      const t = e.clipboardData?.getData("text/plain") ?? "";
      const url = extractHttpUrl(t);
      if (!url) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      addMediaAt(url, r.left + r.width / 2, r.top + r.height / 2);
    };
    window.addEventListener("paste", onWinPaste);
    return () => window.removeEventListener("paste", onWinPaste);
  }, [addMediaAt]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const z = zoomRef.current;
    if (resizeRef.current) {
      const { id, startX, startY, origW, origH } = resizeRef.current;
      const dx = (e.clientX - startX) / z;
      const dy = (e.clientY - startY) / z;
      const rawW = origW + dx;
      const rawH = origH + dy;
      const w = Math.max(120, snapToGrid(rawW));
      const h = Math.max(80, snapToGrid(rawH));
      setWorkspace((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === id ? { ...it, width: w, height: h } : it
        ),
      }));
      return;
    }
    if (dragRef.current) {
      const { id, startX, startY, origX, origY } = dragRef.current;
      const dx = (e.clientX - startX) / z;
      const dy = (e.clientY - startY) / z;
      const nx = snapToGrid(origX + dx);
      const ny = snapToGrid(origY + dy);
      setWorkspace((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === id ? { ...it, x: nx, y: ny } : it
        ),
      }));
    }
  }, []);

  const endDrag = useCallback(() => {
    if (dragRef.current || resizeRef.current) {
      dragRef.current = null;
      resizeRef.current = null;
      setWorkspace((prev) => {
        if (prev && anchor) scheduleSave(prev);
        return prev;
      });
    }
  }, [anchor, scheduleSave]);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [onPointerMove, endDrag]);

  const startDrag = useCallback(
    (item: WorkspaceCanvasItem, e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        id: item.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: item.x,
        origY: item.y,
      };
      setSelectedId(item.id);
    },
    []
  );

  const startResize = useCallback(
    (item: WorkspaceCanvasItem, e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      resizeRef.current = {
        id: item.id,
        startX: e.clientX,
        startY: e.clientY,
        origW: item.width,
        origH: item.height,
      };
      setSelectedId(item.id);
    },
    []
  );

  const removeItem = useCallback(
    (id: string) => {
      setAndPersist((w) => ({
        ...w,
        items: w.items.filter((x) => x.id !== id),
      }));
      setSelectedId((s) => (s === id ? null : s));
    },
    [setAndPersist]
  );

  const confirmDeleteArtifact = useCallback(() => {
    setPendingDeleteArtifactId((current) => {
      if (current) removeItem(current);
      return null;
    });
  }, [removeItem]);

  const cancelDeleteArtifact = useCallback(() => {
    setPendingDeleteArtifactId(null);
  }, []);

  const updateMarkdown = useCallback(
    (id: string, body: string) => {
      setWorkspace((prev) => {
        const next = {
          ...prev,
          items: prev.items.map((it) =>
            it.id === id && it.type === "markdown" ? { ...it, body } : it
          ),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateItemFields = useCallback(
    (
      id: string,
      patch: Partial<{
        title: string;
        linkedTaskId: string | null;
        linkRole: WorkspaceItemLinkRole | null;
        parentMarkdownId: string | null;
      }>
    ) => {
      setWorkspace((prev) => {
        const next = {
          ...prev,
          items: prev.items.map((it) =>
            it.id === id ? { ...it, ...patch } : it
          ),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const handleWheel = useCallback((e: WheelEvent) => {
    const vp = viewportRef.current;
    if (!vp) return;

    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      const h = vp.clientHeight || 400;
      dx *= h;
      dy *= h;
    }
    if (e.shiftKey && dx === 0 && dy !== 0) {
      dx = dy;
      dy = 0;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setCanvasZoom((prevZoom) => {
        const nextZoom = clampZoom(prevZoom * (1 - dy * 0.002));
        setCanvasPan((pan) =>
          zoomAtViewportPoint(e.clientX, e.clientY, vp, pan, prevZoom, nextZoom)
        );
        return nextZoom;
      });
    } else {
      e.preventDefault();
      setCanvasPan((p) => ({
        x: p.x - dx,
        y: p.y - dy,
      }));
    }
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel, anchor?._id, section?._id, tasksLoading, sectionsLoading]);

  const zoomIn = useCallback(() => {
    setCanvasZoom((z) => clampZoom(z * ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setCanvasZoom((z) => clampZoom(z / ZOOM_STEP));
  }, []);

  const resetCanvasView = useCallback(() => {
    setCanvasZoom(1);
    setCanvasPan({ x: 0, y: 0 });
  }, []);

  const toggleSidebarCollapse = useCallback((id: string) => {
    setSidebarCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleMarkdownCollapse = useCallback((id: string) => {
    setCollapsedMarkdownIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  if (!tasksLoading && !anchor) {
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

  if (!anchor || !section) {
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

  const showSidebar = !isNarrow;
  const depthIndentOffset = anchor.depth;

  const sidebarBody = (
    <div style={{ padding: "4px 0" }}>
      {flatTasks.map((task) => {
        const lc = taskLinkCounts[task._id];
        return (
          <WorkspaceTaskRow
            key={task._id}
            task={task}
            anchorId={anchor._id}
            depthIndentOffset={depthIndentOffset}
            isRecurringSection={section?.type === "recurring"}
            directChildCount={childCountMap[task._id] ?? 0}
            isCollapsed={sidebarCollapsedIds.has(task._id)}
            assetCount={lc?.assets ?? 0}
            finalCount={lc?.finals ?? 0}
            onToggleCollapse={toggleSidebarCollapse}
            onToggleComplete={(t) =>
              void updateTask({ _id: t._id, completed: !t.completed })
            }
            onOpenDetails={openTaskDetails}
            onOpenNote={(t) => setNoteModalTaskId(t._id)}
            selectedForDetail={detailTaskId === task._id}
          />
        );
      })}
    </div>
  );

  const markdownSidebarBody = (
    <div style={{ padding: "4px 0" }}>
      {markdownPageTree.length === 0 ? (
        <div
          style={{
            padding: "4px 10px",
            fontSize: 10,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
        >
          No pages yet.
        </div>
      ) : (
        markdownPageTree.map((node) => (
          <MarkdownPageRow
            key={node.item.id}
            node={node}
            depth={0}
            collapsedIds={collapsedMarkdownIds}
            selectedId={selectedId}
            onToggleCollapse={toggleMarkdownCollapse}
            onSelect={setSelectedId}
          />
        ))
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div
        style={{
          flex: 1,
          maxWidth: detailTaskId ? "calc(100% - 380px)" : "100%",
          transition: "max-width 0.2s",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
      {isNarrow && !mobileWorkspaceMenuOpen && (
        <MobileAppMenuCollapsedBar
          title={`Workspace · ${anchor.title.trim() || "Untitled"}`}
          subtitle={section.title}
          menuId="workspace-full-menu"
          onExpand={() => setMobileWorkspaceMenuOpen(true)}
          links={
            <>
              <Link
                href="/"
                style={{ color: "var(--accent-blue)", fontWeight: 600 }}
              >
                Board
              </Link>
              <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                ·
              </span>
              <Link
                href={`/task/${taskId}`}
                style={{ color: "var(--accent-blue)", fontWeight: 600 }}
              >
                Task
              </Link>
              <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                ·
              </span>
              <Link href="/pages" style={{ color: "var(--accent-blue)" }}>
                Pages
              </Link>
            </>
          }
        />
      )}

      {(!isNarrow || mobileWorkspaceMenuOpen) && (
      <header
        id={isNarrow ? "workspace-full-menu" : undefined}
        style={{
          padding: isNarrow ? "12px 16px 12px" : "16px 20px",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: isNarrow ? 8 : 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <Link href="/" style={{ color: "var(--accent-blue)", fontWeight: 600 }}>
            Board
          </Link>
          <span style={{ color: "var(--text-muted)" }}>/</span>
          <Link
            href={`/task/${taskId}`}
            style={{ color: "var(--accent-blue)" }}
          >
            Task
          </Link>
          {anchor.parentId && (
            <>
              <span style={{ color: "var(--text-muted)" }}>/</span>
              <Link
                href={`/task/${anchor.parentId}`}
                style={{ color: "var(--accent-blue)" }}
              >
                Parent
              </Link>
            </>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "100%",
          }}
        >
          <div
            style={
              isNarrow && mobileWorkspaceMenuOpen
                ? { flex: "1 1 100%", minWidth: 0, width: "100%" }
                : undefined
            }
          >
            {isNarrow && mobileWorkspaceMenuOpen ? (
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
                    fontSize: 20,
                    fontWeight: 700,
                    margin: 0,
                    color: "var(--text-primary)",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  Workspace · {anchor.title.trim() || "Untitled"}
                </h1>
                <MobileAppMenuCollapseButton
                  inline
                  menuId="workspace-full-menu"
                  onCollapse={() => setMobileWorkspaceMenuOpen(false)}
                />
              </div>
            ) : (
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text-primary)",
                }}
              >
                Workspace · {anchor.title.trim() || "Untitled"}
              </h1>
            )}
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                margin: "6px 0 0",
              }}
            >
              {section.title} — wheel to pan, Ctrl+wheel to zoom; drop or paste
              links; title & task links on each frame.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginRight: 4,
              }}
            >
              {Math.round(canvasZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={zoomOut}
              title="Zoom out"
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              −
            </button>
            <button
              type="button"
              onClick={zoomIn}
              title="Zoom in"
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              +
            </button>
            <button
              type="button"
              onClick={resetCanvasView}
              title="Reset pan & zoom"
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                fontSize: 12,
              }}
            >
              Reset view
            </button>
            {isNarrow && (
              <button
                type="button"
                onClick={() => setMobileTasksOpen(true)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Tasks
              </button>
            )}
            <button
              type="button"
              onClick={() => addMarkdownFrame(null)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: "var(--accent-blue)",
                color: "white",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Add page
            </button>
          </div>
        </div>
      </header>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {showSidebar && (
          <aside
            style={{
              width: 236,
              flexShrink: 0,
              borderRight: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              overflow: "auto",
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              Task & subtasks
            </div>
            {sidebarBody}
            <div
              style={{
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                borderTop: "1px solid var(--border-subtle)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              Markdown pages
            </div>
            {markdownSidebarBody}
          </aside>
        )}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-primary)",
          }}
        >
          <div
            ref={viewportRef}
            tabIndex={0}
            data-workspace-canvas
            onDrop={onCanvasDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => setSelectedId(null)}
            style={{
              flex: 1,
              overflow: "hidden",
              position: "relative",
              outline: "none",
              minHeight: "60vh",
              background: "var(--bg-primary)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
                transformOrigin: "0 0",
                width: WORLD_CANVAS_SIZE,
                height: WORLD_CANVAS_SIZE,
                backgroundImage: `
                  radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)
                `,
                backgroundSize: "20px 20px",
              }}
            >
              {workspace.items.map((item) => (
                <WorkspaceFrame
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  linkableTasks={linkableTasks}
                  onSelect={() => setSelectedId(item.id)}
                  onDragStart={startDrag}
                  onResizeStart={startResize}
                  onRemove={() => setPendingDeleteArtifactId(item.id)}
                  onMarkdownChange={updateMarkdown}
                  onUpdateFields={updateItemFields}
                  onVideoPlay={(url) => setPlayingUrl(url)}
                  markdownPages={markdownPages}
                  onAddChildMarkdown={addMarkdownFrame}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>

      {detailTask && (
        <TaskDetailPanel
          key={detailTask._id}
          task={detailTask}
          section={detailTaskSection}
          directChildCount={
            tasks.filter((t) => t.parentId === detailTask._id).length
          }
          onUpdate={updateTask}
          onClose={() => setDetailTaskId(null)}
          onDuplicate={handleDuplicateTask}
          duplicateBusy={duplicateBusy}
          tasks={tasks}
          reorderTasks={reorderTasks}
          createTask={createTask}
          onNavigateToTask={(id) => setDetailTaskId(id)}
        />
      )}

      {isNarrow && mobileTasksOpen && (
        <>
          <button
            type="button"
            aria-label="Close tasks"
            onClick={() => setMobileTasksOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              border: "none",
              zIndex: 200,
            }}
          />
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "58vh",
              background: "var(--bg-secondary)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              border: "1px solid var(--border-color)",
              borderBottom: "none",
              zIndex: 201,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              Task & subtasks
              <button
                type="button"
                onClick={() => setMobileTasksOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>{sidebarBody}</div>
            <div
              style={{
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                borderTop: "1px solid var(--border-subtle)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              Markdown pages
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>{markdownSidebarBody}</div>
          </div>
        </>
      )}

      <DeleteWorkspaceArtifactModal
        open={Boolean(pendingDeleteArtifactId)}
        artifactLabel={pendingArtifactLabel}
        onConfirm={confirmDeleteArtifact}
        onCancel={cancelDeleteArtifact}
      />

      <TaskNotesModal
        open={Boolean(noteModalTask)}
        taskTitle={noteModalTask?.title ?? ""}
        notes={noteModalTask?.notes ?? ""}
        onClose={() => setNoteModalTaskId(null)}
      />

      {playingUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setPlayingUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPlayingUrl(null)}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            Close
          </button>
          <video
            src={playingUrl}
            controls
            autoPlay
            style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 8 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function getFrameAppearance(item: WorkspaceCanvasItem, selected: boolean) {
  const hasLink = Boolean(item.linkedTaskId);
  const isFinal = item.linkRole === "final";
  const isAsset = hasLink && !isFinal;
  const drop = "0 2px 12px rgba(0,0,0,0.25)";
  const lift = "0 4px 20px rgba(0,0,0,0.28)";

  if (!hasLink) {
    return {
      border: selected
        ? "2px solid var(--accent-blue)"
        : "1px solid var(--border-color)",
      background: "var(--bg-secondary)",
      boxShadow: selected
        ? "0 4px 24px rgba(75, 156, 245, 0.2)"
        : drop,
    };
  }

  if (isFinal) {
    return {
      border: "2px solid rgba(34, 197, 94, 0.55)",
      background: "rgba(34, 197, 94, 0.08)",
      boxShadow: selected
        ? `0 0 0 2px var(--accent-blue), ${lift}`
        : drop,
    };
  }

  return {
    border: "2px solid rgba(245, 158, 11, 0.5)",
    background: "rgba(245, 158, 11, 0.09)",
    boxShadow: selected
      ? `0 0 0 2px var(--accent-blue), ${lift}`
      : drop,
  };
}

function WorkspaceTaskRow({
  task,
  anchorId,
  depthIndentOffset,
  directChildCount,
  isCollapsed,
  assetCount,
  finalCount,
  onToggleCollapse,
  onToggleComplete,
  onOpenDetails,
  onOpenNote,
  isRecurringSection,
  selectedForDetail,
}: {
  task: TaskItem;
  anchorId: string;
  depthIndentOffset: number;
  directChildCount: number;
  isCollapsed: boolean;
  assetCount: number;
  finalCount: number;
  onToggleCollapse: (id: string) => void;
  onToggleComplete: (task: TaskItem) => void;
  onOpenDetails: (task: TaskItem) => void;
  onOpenNote: (task: TaskItem) => void;
  isRecurringSection: boolean;
  selectedForDetail: boolean;
}) {
  const depth = Math.max(0, task.depth - depthIndentOffset);
  const pad = 6 + depth * 10;
  const isAnchor = task._id === anchorId;
  const hasChildren = directChildCount > 0;
  const linkTitleColor =
    finalCount > 0
      ? "var(--accent-green)"
      : assetCount > 0
        ? "var(--accent-amber)"
        : null;

  return (
    <div
      style={{
        padding: `2px 6px 2px ${pad}px`,
        fontSize: 11,
        color: isAnchor ? "var(--text-primary)" : "var(--text-secondary)",
        fontWeight: isAnchor ? 600 : 400,
        borderLeft: isAnchor ? "2px solid var(--accent-blue)" : "2px solid transparent",
        background: selectedForDetail
          ? "rgba(59, 130, 246, 0.12)"
          : "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          minHeight: 22,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand subtasks" : "Collapse subtasks"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(task._id);
            }}
            style={{
              flexShrink: 0,
              width: 18,
              height: 18,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {isCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
        ) : (
          <span style={{ width: 18, flexShrink: 0 }} aria-hidden />
        )}
        <button
          type="button"
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(task);
          }}
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            borderRadius: "50%",
            color: task.completed ? "var(--accent-green)" : "var(--text-muted)",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          {task.completed ? "✓" : "○"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails(task);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "1px 2px",
            margin: 0,
            border: "none",
            borderRadius: 3,
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
          }}
        >
          <span
            style={{
              display: "block",
              width: "100%",
              textDecoration: task.completed ? "line-through" : "none",
              opacity: task.completed ? 0.75 : 1,
              color:
                linkTitleColor ??
                (isAnchor ? "var(--text-primary)" : "var(--text-secondary)"),
            }}
          >
            {task.title.trim() || "Untitled"}
          </span>
        </button>
        {task.linkedPageId && (
          <button
            type="button"
            title="Open linked page"
            aria-label="Open linked page"
            onClick={(e) => {
              e.stopPropagation();
              const pageId = task.linkedPageId;
              if (!pageId) return;
              window.location.href = `/pages?pageId=${encodeURIComponent(
                pageId
              )}&taskId=${encodeURIComponent(task._id)}`;
            }}
            style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 4,
              background: "transparent",
              color: "var(--accent-blue)",
              cursor: "pointer",
            }}
          >
            <LinkIcon size={14} />
          </button>
        )}

        {isRecurringSection && task.recurringNotesPageId && (
          <button
            type="button"
            title="Open daily notes page"
            aria-label="Open daily notes page"
            onClick={(e) => {
              e.stopPropagation();
              const pageId = task.recurringNotesPageId;
              if (!pageId) return;
              const ymd = getActiveTodayFocusYmd();
              window.location.href = `/pages?pageId=${encodeURIComponent(
                pageId
              )}&taskId=${encodeURIComponent(task._id)}&date=${encodeURIComponent(ymd)}`;
            }}
            style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 4,
              background: "transparent",
              color: "var(--accent-blue)",
              cursor: "pointer",
            }}
          >
            <LinkIcon size={14} />
          </button>
        )}
        {task.notes?.trim() && (
          <button
            type="button"
            title="View notes"
            aria-label="View notes"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNote(task);
            }}
            style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 4,
              background: "transparent",
              color: "var(--accent-amber)",
              cursor: "pointer",
            }}
          >
            <FileText size={14} />
          </button>
        )}
        {finalCount > 0 && (
          <span
            title="Has a final artifact on the canvas"
            style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: "var(--accent-green)",
              flexShrink: 0,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
            }}
          />
        )}
      </div>
    </div>
  );
}

function MarkdownPageRow({
  node,
  depth,
  collapsedIds,
  selectedId,
  onToggleCollapse,
  onSelect,
}: {
  node: MarkdownPageTreeNode;
  depth: number;
  collapsedIds: Set<string>;
  selectedId: string | null;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.item.id);
  const title = node.item.title.trim() || "Untitled";

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          minHeight: 22,
          padding: `2px 6px 2px ${6 + depth * 10}px`,
          background:
            selectedId === node.item.id ? "rgba(59, 130, 246, 0.12)" : "transparent",
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleCollapse(node.item.id)}
            aria-label={isCollapsed ? "Expand pages" : "Collapse pages"}
            style={{
              width: 18,
              height: 18,
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span style={{ width: 18 }} />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.item.id)}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "transparent",
            textAlign: "left",
            color: "var(--text-secondary)",
            padding: "1px 2px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {title}
        </button>
      </div>
      {!isCollapsed &&
        node.children.map((child) => (
          <MarkdownPageRow
            key={child.item.id}
            node={child}
            depth={depth + 1}
            collapsedIds={collapsedIds}
            selectedId={selectedId}
            onToggleCollapse={onToggleCollapse}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function WorkspaceFrame({
  item,
  selected,
  linkableTasks,
  onSelect,
  onDragStart,
  onResizeStart,
  onRemove,
  onMarkdownChange,
  onUpdateFields,
  onVideoPlay,
  markdownPages,
  onAddChildMarkdown,
}: {
  item: WorkspaceCanvasItem;
  selected: boolean;
  linkableTasks: { id: string; label: string }[];
  onSelect: () => void;
  onDragStart: (item: WorkspaceCanvasItem, e: React.PointerEvent) => void;
  onResizeStart: (item: WorkspaceCanvasItem, e: React.PointerEvent) => void;
  onRemove: () => void;
  onMarkdownChange: (id: string, body: string) => void;
  onUpdateFields: (
    id: string,
    patch: Partial<{
      title: string;
      linkedTaskId: string | null;
      linkRole: WorkspaceItemLinkRole | null;
      parentMarkdownId: string | null;
    }>
  ) => void;
  onVideoPlay: (url: string) => void;
  markdownPages: Extract<WorkspaceCanvasItem, { type: "markdown" }>[];
  onAddChildMarkdown: (parentMarkdownId: string | null) => void;
}) {
  const [editingMd, setEditingMd] = useState(false);
  const markdownParentChoices = useMemo(
    () => markdownPages.filter((p) => p.id !== item.id),
    [markdownPages, item.id]
  );

  const typeHint =
    item.type === "image"
      ? "Image"
      : item.type === "video"
        ? "Video"
        : "Markdown";

  const frameLook = getFrameAppearance(item, selected);
  const hasLink = Boolean(item.linkedTaskId);
  const isFinalLink = item.linkRole === "final";
  const isAssetLink = hasLink && !isFinalLink;

  return (
    <div
      style={{
        position: "absolute",
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        borderRadius: 10,
        border: frameLook.border,
        background: frameLook.background,
        boxShadow: frameLook.boxShadow,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: selected ? 5 : 1,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        style={{
          flexShrink: 0,
          borderBottom: "1px solid var(--border-subtle)",
          background: isFinalLink
            ? "rgba(34, 197, 94, 0.12)"
            : isAssetLink
              ? "rgba(245, 158, 11, 0.12)"
              : "var(--bg-tertiary)",
          userSelect: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 8px 6px",
          }}
        >
          <button
            type="button"
            title="Drag to move"
            aria-label="Drag to move"
            onPointerDown={(e) => onDragStart(item, e)}
            style={{
              flexShrink: 0,
              width: 22,
              height: 26,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "grab",
              touchAction: "none",
            }}
          >
            <GripVertical size={14} />
          </button>
          <input
            type="text"
            value={item.title}
            onChange={(e) =>
              onUpdateFields(item.id, { title: e.target.value })
            }
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder={typeHint}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.25,
              padding: "4px 6px",
              margin: 0,
              border: "1px solid transparent",
              borderRadius: 4,
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          />
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              padding: 2,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <Trash size={14} />
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            padding: "0 8px 8px",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {typeHint}
          </span>
          <select
            aria-label="Link to task"
            value={item.linkedTaskId ?? ""}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                onUpdateFields(item.id, {
                  linkedTaskId: null,
                  linkRole: null,
                });
              } else {
                onUpdateFields(item.id, {
                  linkedTaskId: v,
                  linkRole: item.linkRole ?? "asset",
                });
              }
            }}
            style={{
              flex: 1,
              minWidth: 100,
              maxWidth: "100%",
              fontSize: 11,
              padding: "3px 6px",
            }}
          >
            <option value="">No task link</option>
            {linkableTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Asset or final"
            value={item.linkRole ?? ""}
            disabled={!item.linkedTaskId}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value;
              onUpdateFields(item.id, {
                linkRole:
                  v === "asset" || v === "final"
                    ? v
                    : null,
              });
            }}
            style={{
              fontSize: 11,
              padding: "3px 6px",
              opacity: item.linkedTaskId ? 1 : 0.45,
            }}
          >
            <option value="">Role</option>
            <option value="asset">Asset</option>
            <option value="final">Final</option>
          </select>
          {item.type === "markdown" && (
            <>
              <select
                aria-label="Parent markdown page"
                value={item.parentMarkdownId ?? ""}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  onUpdateFields(item.id, {
                    parentMarkdownId: e.target.value || null,
                  })
                }
                style={{
                  fontSize: 11,
                  padding: "3px 6px",
                  maxWidth: 130,
                }}
              >
                <option value="">Root page</option>
                {markdownParentChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title.trim() || "Untitled"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChildMarkdown(item.id);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  padding: "3px 6px",
                }}
                title="Add child page"
              >
                <Plus size={12} />
                Child
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {item.type === "image" && (
          <img
            src={item.url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              background: "var(--bg-primary)",
            }}
          />
        )}
        {item.type === "video" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVideoPlay(item.url);
            }}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              position: "relative",
              display: "block",
              background: "#000",
            }}
          >
            <video
              src={item.url}
              muted
              playsInline
              preload="metadata"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                pointerEvents: "none",
              }}
            />
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.25)",
              }}
            >
              <PlayOverlay />
            </span>
          </button>
        )}
        {item.type === "markdown" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "6px 8px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-secondary)",
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingMd(true);
                }}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  background: editingMd ? "var(--accent-blue)" : "var(--bg-tertiary)",
                  color: editingMd ? "white" : "var(--text-secondary)",
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingMd(false);
                }}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  background: !editingMd ? "var(--accent-blue)" : "var(--bg-tertiary)",
                  color: !editingMd ? "white" : "var(--text-secondary)",
                }}
              >
                Preview
              </button>
            </div>
            {editingMd ? (
              <textarea
                value={item.body}
                onChange={(e) => onMarkdownChange(item.id, e.target.value)}
                autoFocus
                style={{
                  flex: 1,
                  width: "100%",
                  resize: "none",
                  border: "none",
                  margin: 0,
                  padding: 10,
                  fontSize: 13,
                  fontFamily: "ui-monospace, monospace",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingMd(true);
                }}
                style={{
                  flex: 1,
                  overflow: "auto",
                  textAlign: "left",
                  border: "none",
                  background: "var(--bg-primary)",
                  padding: 10,
                  cursor: "text",
                }}
              >
                <div className="workspace-md">
                  <ReactMarkdown>{item.body}</ReactMarkdown>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      <div
        data-resize
        onPointerDown={(e) => onResizeStart(item, e)}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 18,
          height: 18,
          cursor: "nwse-resize",
          touchAction: "none",
          background: "linear-gradient(135deg, transparent 50%, var(--text-muted) 50%)",
          opacity: 0.45,
          borderTopLeftRadius: 4,
        }}
      />
    </div>
  );
}
