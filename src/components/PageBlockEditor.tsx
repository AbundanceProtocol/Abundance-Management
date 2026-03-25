"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TaskItem, Section } from "@/lib/types";
import {
  Bold,
  Italic,
  Quote,
  ListBulleted,
  ListNumbered,
  Link as LinkIcon,
  Braces,
  Undo,
  Redo,
  Trash,
  FileText,
  ZoomIn,
  ChevronRight,
  ChevronDown,
} from "./Icons";
import {
  newLinkId,
  PAGE_TASK_MARK_CLASS,
  parsePageBody,
  serializePageDocument,
  type PageDocumentV3,
} from "@/lib/pageDocument";
import TaskTreeSelect from "./TaskTreeSelect";
import TaskNotesModal from "./TaskNotesModal";
import { filterSubtreeTasks } from "@/lib/taskSubtree";
import { filterTasksForMainView } from "@/lib/recurrence";
import { buildVisibleTaskTree } from "@/lib/timelineUtils";
import { normalizeWorkspace } from "@/lib/workspaceNormalize";
import { snapToGrid } from "@/lib/workspaceCanvas";
import {
  classifyMediaUrl,
  normalizeDropboxDirectUrl,
} from "@/lib/mediaUrl";
import type {
  WorkspaceCanvasItem,
  WorkspaceItemLinkRole,
} from "@/lib/workspaceTypes";
import {
  DEFAULT_WORKSPACE,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_VIDEO_SIZE,
} from "@/lib/workspaceTypes";

type PageBlockEditorProps = {
  pageId: string;
  body: string;
  onChange: (serializedBody: string) => void;
  editing: boolean;
  /** Allowed tasks in depth-first tree order (see `orderTasksForPageLinkPicker`). */
  linkTaskOptions: TaskItem[];
  /** Page’s linked root task; drives subtree indent in the picker. */
  pageLinkedRootTaskId: string | null;
  tasks: TaskItem[];
  sections: Section[];
  updateTask: (task: Partial<TaskItem> & { _id: string }) => void | Promise<void>;
};

const TASKS_PANEL_WIDTH_STORAGE_KEY = "pages.tasksPanelWidth";
const DEFAULT_TASKS_PANEL_WIDTH = 262;
const MIN_TASKS_PANEL_WIDTH = 200;
const MAX_TASKS_PANEL_WIDTH = 720;

function readStoredTasksPanelWidth(): number {
  if (typeof window === "undefined") return DEFAULT_TASKS_PANEL_WIDTH;
  try {
    const raw = localStorage.getItem(TASKS_PANEL_WIDTH_STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (
      Number.isFinite(n) &&
      n >= MIN_TASKS_PANEL_WIDTH &&
      n <= MAX_TASKS_PANEL_WIDTH
    ) {
      return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_TASKS_PANEL_WIDTH;
}

function newWorkspaceItemId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
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

function PageLinkedTaskGutterCard({
  m,
  markerIndex,
  tasks,
  sections,
  pageLinkedRootTaskId,
  editing,
  updateTask,
  onRemoveLink,
  addWorkspaceUrl,
  onOpenNotes,
  thumbnailsExpanded,
  globalSubtasksMode,
  globalSubtasksVersion,
  onExpandThumbnails,
}: {
  m: { linkId: string; taskId: string; top: number; height: number };
  markerIndex: number;
  tasks: TaskItem[];
  sections: Section[];
  pageLinkedRootTaskId: string | null;
  editing: boolean;
  updateTask: (task: Partial<TaskItem> & { _id: string }) => void | Promise<void>;
  onRemoveLink: (linkId: string) => void;
  addWorkspaceUrl: (
    targetTaskId: string,
    role: WorkspaceItemLinkRole,
    rawUrl: string
  ) => void;
  onOpenNotes: (taskId: string) => void;
  thumbnailsExpanded: boolean;
  globalSubtasksMode: "expanded" | "collapsed";
  globalSubtasksVersion: number;
  onExpandThumbnails: (
    markerLinkId: string,
    hostTaskId: string,
    rootTaskId: string
  ) => void;
}) {
  const anchor = tasks.find((t) => t._id === m.taskId);
  const section = anchor ? sections.find((s) => s._id === anchor.sectionId) : null;
  const hostId = pageLinkedRootTaskId?.trim() || m.taskId;
  const hostTask = tasks.find((t) => t._id === hostId) ?? null;

  const gutterSubtreeBaseList = useMemo(() => {
    if (!anchor) return [];
    const subtree = filterSubtreeTasks(tasks, m.taskId);
    return filterTasksForMainView(subtree, true);
  }, [anchor, m.taskId, tasks]);

  const childCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of gutterSubtreeBaseList) {
      if (t.parentId) {
        map[t.parentId] = (map[t.parentId] || 0) + 1;
      }
    }
    return map;
  }, [gutterSubtreeBaseList]);

  const [gutterCollapsedIds, setGutterCollapsedIds] = useState<Set<string>>(
    () => new Set()
  );

  const toggleGutterCollapse = useCallback((id: string) => {
    setGutterCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAllSubtasksInCard = useCallback(() => {
    // Collapse every task that has direct children within this card.
    const allParents = new Set(
      Object.keys(childCountMap).filter((id) => childCountMap[id] > 0)
    );
    setGutterCollapsedIds(allParents);
  }, [childCountMap]);

  const expandAllSubtasksInCard = useCallback(() => {
    setGutterCollapsedIds(new Set());
  }, []);

  useEffect(() => {
    if (globalSubtasksMode === "collapsed") {
      collapseAllSubtasksInCard();
    } else {
      expandAllSubtasksInCard();
    }
  }, [
    globalSubtasksMode,
    globalSubtasksVersion,
    collapseAllSubtasksInCard,
    expandAllSubtasksInCard,
  ]);

  const orderedTasks = useMemo(() => {
    if (!anchor) return [];
    const topSort = section?.topLevelSort ?? "manual";
    return [
      anchor,
      ...buildVisibleTaskTree(
        gutterSubtreeBaseList,
        anchor._id,
        gutterCollapsedIds,
        topSort
      ),
    ];
  }, [anchor, section, gutterSubtreeBaseList, gutterCollapsedIds]);

  const depthOffset = anchor?.depth ?? 0;

  const [expandedMarkdownIds, setExpandedMarkdownIds] = useState<Set<string>>(
    () => new Set()
  );
  const toggleMarkdownExpand = useCallback((id: string) => {
    setExpandedMarkdownIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        top: m.top,
        left: 6,
        right: 6,
        // Keep the gutter card visually bounded to the measured "section"
        // height; allow internal scrolling for overflow.
        // We add a small constant to compensate for the card's own vertical
        // padding/border so the visual block matches the intended bounds.
        height: Math.max(26, m.height + 11),
        zIndex: 10 + markerIndex,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        // Prevent CSS max-height from capping the card and making some
        // linked-task comments visually shorter than their highlight range.
        maxHeight: Math.max(26, m.height + 11),
        borderRadius: 6,
        border: "1px solid var(--border-subtle)",
        borderLeft: "3px solid rgba(244, 114, 182, 0.75)",
        background: "var(--bg-primary)",
        padding: "4px 6px 5px",
        fontSize: 11,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 4,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            title="Collapse subtasks"
            aria-label="Collapse subtasks"
            onMouseDown={(e) => e.preventDefault()}
            onClick={collapseAllSubtasksInCard}
            style={{
              width: 22,
              height: 22,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            title="Expand subtasks"
            aria-label="Expand subtasks"
            onMouseDown={(e) => e.preventDefault()}
            onClick={expandAllSubtasksInCard}
            style={{
              width: 22,
              height: 22,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <button
          type="button"
          title="Expand thumbnails"
          aria-label="Expand thumbnails"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onExpandThumbnails(m.linkId, hostId, m.taskId)}
          style={{
            width: 22,
            height: 22,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            border: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ZoomIn size={12} />
        </button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {!anchor ? (
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Missing task</div>
        ) : (
          orderedTasks.map((task, idx) => {
            const directChildCount = childCountMap[task._id] ?? 0;
            const hasChildTasks = directChildCount > 0;
            const subtreeCollapsed = gutterCollapsedIds.has(task._id);
            const indent = Math.max(0, (task.depth ?? 0) - depthOffset) * 8;
            const rowItems =
              hostTask?.workspace?.items.filter((it) => it.linkedTaskId === task._id) ?? [];
            const finals = rowItems.filter((it) => it.linkRole === "final");
            const assets = rowItems.filter((it) => it.linkRole !== "final");
            const assetThumbItems = assets.filter(
              (it) => it.type === "image" || it.type === "video"
            );
            const finalThumbItems = finals.filter(
              (it) => it.type === "image" || it.type === "video"
            );
            const hasNotes = Boolean(task.notes?.trim());
            const hasFinalArtifact = finals.length > 0;
            const hasAssetItems = assets.length > 0;
            const titleColor = task.completed
              ? "var(--text-muted)"
              : hasFinalArtifact
                ? "var(--accent-green)"
                : hasAssetItems
                  ? "var(--accent-amber)"
                  : "var(--text-primary)";

            const accentVar = (a: "amber" | "green") =>
              a === "green" ? "var(--accent-green)" : "var(--accent-amber)";

            const markdownIcon = (
              it: Extract<WorkspaceCanvasItem, { type: "markdown" }>,
              accent: "amber" | "green"
            ) => {
              const isExpanded = expandedMarkdownIds.has(it.id);
              const c = accentVar(accent);
              return (
                <button
                  type="button"
                  key={it.id}
                  title={it.title?.trim() || "Markdown page"}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Collapse page title" : "Expand page title"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleMarkdownExpand(it.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    border: `1px solid ${isExpanded ? c : "var(--border-color)"}`,
                    background: "var(--bg-tertiary)",
                    color: isExpanded ? c : "var(--text-secondary)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <FileText size={12} />
                </button>
              );
            };

            const renderMediaOrIcon = (
              it: WorkspaceCanvasItem,
              accent: "amber" | "green"
            ) => {
              if (it.type === "image") {
                const u = normalizeDropboxDirectUrl(it.url);
                return (
                  <a
                    key={it.id}
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={it.title || "Image"}
                    style={{
                      display: "block",
                      width: 52,
                      height: 34,
                      borderRadius: 3,
                      overflow: "hidden",
                      border: "1px solid var(--border-subtle)",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={u}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        background: "var(--bg-secondary)",
                      }}
                    />
                  </a>
                );
              }
              if (it.type === "video") {
                const u = normalizeDropboxDirectUrl(it.url);
                return (
                  <a
                    key={it.id}
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={it.title || "Video"}
                    style={{
                      position: "relative",
                      display: "block",
                      width: 52,
                      height: 34,
                      borderRadius: 3,
                      overflow: "hidden",
                      border: "1px solid var(--border-subtle)",
                      flexShrink: 0,
                      background: "#000",
                    }}
                  >
                    <video
                      src={u}
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
                        fontSize: 13,
                        color: "white",
                        textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                      }}
                    >
                      ▶
                    </span>
                  </a>
                );
              }
              if (it.type === "markdown") {
                return markdownIcon(it, accent);
              }
              return null;
            };

            return (
              <div
                key={task._id}
                style={{
                  borderTop: idx > 0 ? "1px solid var(--border-subtle)" : undefined,
                  paddingTop: idx > 0 ? 5 : 0,
                  marginLeft: indent,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 4,
                  }}
                >
                  {hasChildTasks ? (
                    <button
                      type="button"
                      aria-expanded={!subtreeCollapsed}
                      aria-label={
                        subtreeCollapsed ? "Expand subtasks" : "Collapse subtasks"
                      }
                      title={subtreeCollapsed ? "Expand subtasks" : "Collapse subtasks"}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleGutterCollapse(task._id)}
                      style={{
                        flexShrink: 0,
                        width: 18,
                        height: 18,
                        marginTop: "0.08em",
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
                      {subtreeCollapsed ? (
                        <ChevronRight size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      )}
                    </button>
                  ) : (
                    <span
                      style={{ width: 18, flexShrink: 0, marginTop: "0.08em" }}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    title={task.completed ? "Mark incomplete" : "Mark complete"}
                    onClick={() => void updateTask({ _id: task._id, completed: !task.completed })}
                    onMouseDown={(e) => e.preventDefault()}
                    style={{
                      width: 18,
                      height: 18,
                      marginTop: "0.08em",
                      flexShrink: 0,
                      borderRadius: "50%",
                      border: `2px solid ${
                        task.completed ? "var(--accent-green)" : "var(--text-secondary)"
                      }`,
                      background: task.completed
                        ? "var(--accent-green)"
                        : "rgba(255, 255, 255, 0.06)",
                      boxShadow: task.completed
                        ? "none"
                        : "inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                    }}
                  >
                    {task.completed && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                        <path
                          d="M2 5l2.5 2.5L8 3"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: titleColor,
                        textDecoration: task.completed ? "line-through" : undefined,
                        lineHeight: 1.28,
                        wordBreak: "break-word",
                      }}
                    >
                      {task.title?.trim() || "Untitled"}
                    </div>
                    {section && task._id === anchor._id && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {section.title}
                      </div>
                    )}
                  </div>
                  {hasNotes && (
                    <button
                      type="button"
                      title="View notes"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onOpenNotes(task._id)}
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      Note
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Assets</span>
                    <button
                      type="button"
                      title="Add asset URL"
                      aria-label="Add asset URL"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const raw =
                          typeof window !== "undefined"
                            ? window.prompt(
                                "Paste URL for asset (image or video; Dropbox links work)"
                              )
                            : null;
                        if (raw?.trim()) addWorkspaceUrl(task._id, "asset", raw);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 18,
                        padding: 0,
                        borderRadius: 3,
                        border: "1px dashed var(--border-color)",
                        background: "transparent",
                        color: "var(--accent-amber)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <LinkIcon size={11} />
                    </button>
                    {thumbnailsExpanded ? (
                      assetThumbItems.length > 0 ? (
                        assetThumbItems.map((it) => renderMediaOrIcon(it, "amber"))
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            width: 52,
                            height: 34,
                            border: "1px solid transparent",
                            flexShrink: 0,
                          }}
                          aria-hidden
                        />
                      )
                    ) : null}
                    {thumbnailsExpanded && (
                      <span
                        style={{
                          color: "var(--border-subtle)",
                          fontSize: 10,
                          lineHeight: 1,
                          userSelect: "none",
                        }}
                        aria-hidden
                      >
                        ·
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Final</span>
                    <button
                      type="button"
                      title="Add final artifact URL"
                      aria-label="Add final artifact URL"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const raw =
                          typeof window !== "undefined"
                            ? window.prompt("Paste URL for final artifact (image or video)")
                            : null;
                        if (raw?.trim()) addWorkspaceUrl(task._id, "final", raw);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 18,
                        padding: 0,
                        borderRadius: 3,
                        border: "1px dashed var(--border-color)",
                        background: "transparent",
                        color: "var(--accent-green)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <LinkIcon size={11} />
                    </button>
                    {thumbnailsExpanded ? (
                      finalThumbItems.length > 0 ? (
                        finalThumbItems.map((it) => renderMediaOrIcon(it, "green"))
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            width: 52,
                            height: 34,
                            border: "1px solid transparent",
                            flexShrink: 0,
                          }}
                          aria-hidden
                        />
                      )
                    ) : null}
                  </div>
                  {!thumbnailsExpanded &&
                    assets
                      .filter(
                        (it) =>
                          it.type === "markdown" && expandedMarkdownIds.has(it.id)
                      )
                      .map((it) => (
                        <div
                          key={`exp-a-${it.id}`}
                          style={{
                            fontSize: 10,
                            color: "var(--text-secondary)",
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            padding: "4px 6px",
                            borderRadius: 4,
                            border:
                              "1px solid var(--border-subtle)",
                            background: "var(--bg-secondary)",
                          }}
                        >
                          {it.title?.trim() || "Markdown"}
                        </div>
                      ))}
                  {!thumbnailsExpanded &&
                    finals
                      .filter(
                        (it) =>
                          it.type === "markdown" && expandedMarkdownIds.has(it.id)
                      )
                      .map((it) => (
                        <div
                          key={`exp-f-${it.id}`}
                          style={{
                            fontSize: 10,
                            color: "var(--text-secondary)",
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            padding: "4px 6px",
                            borderRadius: 4,
                            border:
                              "1px solid var(--border-subtle)",
                            background: "var(--bg-secondary)",
                          }}
                        >
                          {it.title?.trim() || "Markdown"}
                        </div>
                      ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      {editing && (
        <button
          type="button"
          onClick={() => onRemoveLink(m.linkId)}
          style={{
            flexShrink: 0,
            marginTop: 4,
            paddingTop: 2,
            fontSize: 10,
            border: "none",
            background: "transparent",
            color: "var(--accent-red)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Remove link
        </button>
      )}
    </div>
  );
}

function findParentTaskMark(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      if (el.classList?.contains(PAGE_TASK_MARK_CLASS)) return el;
    }
    n = n.parentNode;
  }
  return null;
}

function wrapSelectionWithTask(editor: HTMLElement, taskId: string, linkId: string): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;

  if (findParentTaskMark(range.startContainer) || findParentTaskMark(range.endContainer)) {
    return false;
  }

  const span = document.createElement("span");
  span.className = PAGE_TASK_MARK_CLASS;
  span.dataset.taskId = taskId;
  span.dataset.linkId = linkId;
  span.title = "Linked task";
  span.style.backgroundColor = "rgba(244, 114, 182, 0.22)";
  span.style.borderRadius = "2px";
  span.style.boxDecorationBreak = "clone";

  try {
    range.surroundContents(span);
  } catch {
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
  }

  sel.removeAllRanges();
  return true;
}

function unwrapTaskMark(span: HTMLElement) {
  const parent = span.parentNode;
  if (!parent) return;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
}

export default function PageBlockEditor({
  pageId,
  body,
  onChange,
  editing,
  linkTaskOptions,
  pageLinkedRootTaskId,
  tasks,
  sections,
  updateTask,
}: PageBlockEditorProps) {
  const [doc, setDoc] = useState<PageDocumentV3>(() => parsePageBody(body));
  const docRef = useRef(doc);
  docRef.current = doc;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editorRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const tasksPanelResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const tasksPanelWidthCommitRef = useRef(readStoredTasksPanelWidth());

  const [tasksPanelWidth, setTasksPanelWidth] = useState(() =>
    readStoredTasksPanelWidth()
  );

  const [markers, setMarkers] = useState<
    Array<{ linkId: string; taskId: string; top: number; height: number }>
  >([]);
  const [linkTargetId, setLinkTargetId] = useState<string>("");
  const [tick, setTick] = useState(0);
  const [thumbnailsExpanded, setThumbnailsExpanded] = useState(false);
  const [globalSubtasksMode, setGlobalSubtasksMode] = useState<
    "expanded" | "collapsed"
  >("expanded");
  const [globalSubtasksVersion, setGlobalSubtasksVersion] = useState(0);
  const [thumbPanel, setThumbPanel] = useState<{
    markerLinkId: string;
    hostTaskId: string;
    rootTaskId: string;
  } | null>(null);

  const thumbHostTask = useMemo(() => {
    if (!thumbPanel) return null;
    return tasks.find((t) => t._id === thumbPanel.hostTaskId) ?? null;
  }, [thumbPanel, tasks]);

  const thumbRootTask = useMemo(() => {
    if (!thumbPanel) return null;
    return tasks.find((t) => t._id === thumbPanel.rootTaskId) ?? null;
  }, [thumbPanel, tasks]);

  const thumbRootSection = useMemo(() => {
    if (!thumbRootTask) return null;
    return sections.find((s) => s._id === thumbRootTask.sectionId) ?? null;
  }, [thumbRootTask, sections]);

  const thumbOrderedTasks = useMemo(() => {
    if (!thumbPanel || !thumbRootTask) return [];
    const subtree = filterSubtreeTasks(tasks, thumbPanel.rootTaskId);
    const baseList = filterTasksForMainView(subtree, true);
    const topSort = thumbRootSection?.topLevelSort ?? "manual";
    return [
      thumbRootTask,
      ...buildVisibleTaskTree(
        baseList,
        thumbPanel.rootTaskId,
        new Set(),
        topSort
      ),
    ];
  }, [thumbPanel, thumbRootTask, thumbRootSection, tasks]);

  const expandedThumbMarker = useMemo(() => {
    if (!thumbPanel) return null;
    return markers.find((m) => m.linkId === thumbPanel.markerLinkId) ?? null;
  }, [thumbPanel, markers]);

  const renderThumb = (
    it: WorkspaceCanvasItem,
    accent: "amber" | "green"
  ) => {
    if (it.type !== "image" && it.type !== "video") return null;
    const u = normalizeDropboxDirectUrl(it.url);
    const commonStyle: React.CSSProperties = {
      position: "relative",
      display: "block",
      width: 52,
      height: 34,
      borderRadius: 3,
      overflow: "hidden",
      border: "1px solid var(--border-subtle)",
      flexShrink: 0,
      background:
        accent === "green" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
    };

    if (it.type === "image") {
      return (
        <a
          key={it.id}
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          title={it.title || "Image"}
          style={commonStyle}
        >
          <img
            src={u}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              background: "var(--bg-secondary)",
            }}
          />
        </a>
      );
    }

    return (
      <a
        key={it.id}
        href={it.url}
        target="_blank"
        rel="noopener noreferrer"
        title={it.title || "Video"}
        style={commonStyle}
      >
        <video
          src={u}
          muted
          playsInline
          preload="metadata"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
            display: "block",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: "white",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          ▶
        </span>
      </a>
    );
  };

  const handleTasksPanelResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      tasksPanelResizeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startWidth: tasksPanelWidth,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [tasksPanelWidth]
  );

  const handleTasksPanelResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const r = tasksPanelResizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      const delta = e.clientX - r.startX;
      const next = Math.round(
        Math.min(
          MAX_TASKS_PANEL_WIDTH,
          // Dragging right (delta > 0) should SHRINK the panel.
          Math.max(MIN_TASKS_PANEL_WIDTH, r.startWidth - delta)
        )
      );
      tasksPanelWidthCommitRef.current = next;
      setTasksPanelWidth(next);
    },
    []
  );

  const endTasksPanelResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const r = tasksPanelResizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      tasksPanelResizeRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      try {
        localStorage.setItem(
          TASKS_PANEL_WIDTH_STORAGE_KEY,
          String(tasksPanelWidthCommitRef.current)
        );
      } catch {
        /* ignore */
      }
    },
    []
  );

  const commitHtml = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    const next: PageDocumentV3 = { v: 3, html };
    setDoc(next);
    onChange(serializePageDocument(next));
  }, [onChange]);

  useEffect(() => {
    return () => {
      const el = editorRef.current;
      if (!el) return;
      const html = el.innerHTML;
      onChangeRef.current(serializePageDocument({ v: 3, html }));
    };
  }, [pageId]);

  useLayoutEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.innerHTML = docRef.current.html;
  }, [pageId]);

  const measureGutter = useCallback(() => {
    const editor = editorRef.current;
    const row = rowRef.current;
    if (!editor || !row) return;

    const rowRect = row.getBoundingClientRect();
    const marks = editor.querySelectorAll<HTMLElement>(
      `span.${PAGE_TASK_MARK_CLASS}[data-link-id][data-task-id]`
    );

    const next: Array<{ linkId: string; taskId: string; top: number; height: number }> = [];
    marks.forEach((el) => {
      const r = el.getBoundingClientRect();
      const linkId = el.dataset.linkId || "";
      const taskId = el.dataset.taskId || "";
      if (!linkId || !taskId) return;
      const topRel = r.top - rowRect.top;
      const height = Math.max(r.height, 1);
      next.push({ linkId, taskId, top: topRel, height });
    });
    next.sort((a, b) => a.top - b.top);
    setMarkers(next);
  }, []);

  useLayoutEffect(() => {
    measureGutter();
  }, [measureGutter, doc.html, tick, editing]);

  useEffect(() => {
    const scroll = scrollRef.current;
    const row = rowRef.current;
    if (!scroll) return;
    const onScroll = () => measureGutter();
    const ro = new ResizeObserver(() => {
      measureGutter();
      setTick((x) => x + 1);
    });
    ro.observe(scroll);
    const ed = editorRef.current;
    if (ed) ro.observe(ed);
    if (row) ro.observe(row);
    scroll.addEventListener("scroll", onScroll);
    return () => {
      ro.disconnect();
      scroll.removeEventListener("scroll", onScroll);
    };
  }, [measureGutter]);

  const runCommand = useCallback((command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
    requestAnimationFrame(() => {
      commitHtml();
      measureGutter();
    });
  }, [commitHtml, measureGutter]);

  const runHistory = useCallback(
    (cmd: "undo" | "redo") => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      document.execCommand(cmd);
      requestAnimationFrame(() => {
        commitHtml();
        measureGutter();
      });
    },
    [commitHtml, measureGutter]
  );

  const insertLinkUrl = useCallback(() => {
    const url = typeof window !== "undefined" ? window.prompt("Link URL") : null;
    if (url == null || url === "") return;
    runCommand("createLink", url);
  }, [runCommand]);

  const insertCodeBlock = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<pre><code style="display:block;white-space:pre-wrap;">code</code></pre>'
    );
    requestAnimationFrame(() => {
      commitHtml();
      measureGutter();
    });
  }, [commitHtml, measureGutter]);

  const applyTaskLink = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const taskId = linkTargetId || linkTaskOptions[0]?._id;
    if (!taskId) return;
    const ok = wrapSelectionWithTask(editor, taskId, newLinkId());
    if (!ok) return;
    requestAnimationFrame(() => {
      commitHtml();
      measureGutter();
    });
  }, [linkTargetId, linkTaskOptions, commitHtml, measureGutter]);

  const removeLinkById = useCallback(
    (linkId: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const span = editor.querySelector<HTMLElement>(
        `span.${PAGE_TASK_MARK_CLASS}[data-link-id="${linkId}"]`
      );
      if (span) unwrapTaskMark(span);
      requestAnimationFrame(() => {
        commitHtml();
        measureGutter();
      });
    },
    [commitHtml, measureGutter]
  );

  const unlinkSelection = useCallback(() => {
    const sel = window.getSelection();
    const mark = sel ? findParentTaskMark(sel.anchorNode) : null;
    if (!mark || !mark.dataset.linkId) return;
    unwrapTaskMark(mark);
    requestAnimationFrame(() => {
      commitHtml();
      measureGutter();
    });
  }, [commitHtml, measureGutter]);

  const [notesTaskId, setNotesTaskId] = useState<string | null>(null);

  const addWorkspaceUrl = useCallback(
    (targetTaskId: string, role: WorkspaceItemLinkRole, rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;
      const url = normalizeDropboxDirectUrl(trimmed);
      if (!/^https?:\/\//i.test(url)) {
        window.alert("Enter a valid http(s) URL.");
        return;
      }
      const hostId = pageLinkedRootTaskId?.trim() ? pageLinkedRootTaskId : targetTaskId;
      const host = tasks.find((t) => t._id === hostId);
      if (!host) return;
      const kind = classifyMediaUrl(url);
      const ws = normalizeWorkspace(host.workspace ?? DEFAULT_WORKSPACE);
      const defaults = kind === "video" ? DEFAULT_VIDEO_SIZE : DEFAULT_IMAGE_SIZE;
      const pos = nextStaggerPosition(ws.items, defaults);
      const id = newWorkspaceItemId();
      const base = {
        id,
        x: snapToGrid(pos.x),
        y: snapToGrid(pos.y),
        width: snapToGrid(defaults.width),
        height: snapToGrid(defaults.height),
        linkedTaskId: targetTaskId,
        linkRole: role,
        title: kind === "video" ? "Video" : "Image",
      };
      const item =
        kind === "video"
          ? { ...base, type: "video" as const, url }
          : { ...base, type: "image" as const, url };
      void updateTask({ _id: host._id, workspace: { items: [...ws.items, item] } });
    },
    [pageLinkedRootTaskId, tasks, updateTask]
  );

  const defaultTaskOption =
    linkTaskOptions.find((t) => t._id === linkTargetId)?._id ??
    linkTaskOptions[0]?._id ??
    "";

  const notesTask = notesTaskId ? tasks.find((t) => t._id === notesTaskId) : null;

  return (
    <>
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {editing && (
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              flexShrink: 0,
              borderBottom: "1px solid var(--border-subtle)",
              padding: "6px 8px",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
              background: "var(--bg-primary)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
          <button
            type="button"
            aria-label="Undo"
            title="Undo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runHistory("undo")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <Undo size={18} />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runHistory("redo")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <Redo size={18} />
          </button>
          <button
            type="button"
            title="Bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("bold")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <Bold size={18} />
          </button>
          <button
            type="button"
            title="Italic"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("italic")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <Italic size={18} />
          </button>
          <button
            type="button"
            title="Inline code"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("insertHTML", "<code>code</code>")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <Braces size={18} />
          </button>
          {(["<h1>", "<h2>", "<h3>"] as const).map((tag) => (
            <button
              key={tag}
              type="button"
              title="Heading"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand("formatBlock", tag)}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 4,
                border: "1px solid var(--border-color)",
                background: "transparent",
                color: "var(--text-primary)",
              }}
            >
              {tag.replace(/[<>]/g, "").toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            title="Paragraph"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("formatBlock", "<p>")}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border-color)",
              background: "transparent",
              color: "var(--text-primary)",
            }}
          >
            P
          </button>
          <select
            title="Text size"
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) => {
              const v = e.target.value;
              if (v) runCommand("fontSize", v);
              e.target.selectedIndex = 0;
            }}
            style={{ fontSize: 12, maxWidth: 100 }}
            defaultValue=""
          >
            <option value="">Size</option>
            <option value="1">Small</option>
            <option value="3">Normal</option>
            <option value="5">Large</option>
            <option value="7">Huge</option>
          </select>
          <button
            type="button"
            title="Quote"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("formatBlock", "<blockquote>")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <Quote size={18} />
          </button>
          <button
            type="button"
            title="Bulleted list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("insertUnorderedList")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <ListBulleted size={18} />
          </button>
          <button
            type="button"
            title="Numbered list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("insertOrderedList")}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <ListNumbered size={18} />
          </button>
          <button
            type="button"
            title="Web link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertLinkUrl}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <LinkIcon size={18} />
          </button>
          <button
            type="button"
            title="Code block"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertCodeBlock}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <span style={{ fontSize: 11, fontWeight: 600 }}>{"</>"}</span>
          </button>

          <span
            style={{
              width: 1,
              height: 22,
              background: "var(--border-color)",
              margin: "0 4px",
              alignSelf: "center",
            }}
          />

          <TaskTreeSelect
            tasks={linkTaskOptions}
            sections={sections}
            value={linkTargetId || defaultTaskOption}
            onChange={setLinkTargetId}
            pageRootTaskId={pageLinkedRootTaskId}
            title="Task to attach to selection"
          />
          <button
            type="button"
            title="Link selected text to task"
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyTaskLink}
            disabled={!linkTaskOptions.length || !(linkTargetId || defaultTaskOption)}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
            }}
          >
            Link to task
          </button>
          <button
            type="button"
            title="Remove link from selection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={unlinkSelection}
            style={{ padding: 6, display: "inline-flex", alignItems: "center" }}
          >
            <Trash size={18} />
          </button>
        </div>
        )}

        <div
          ref={rowRef}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            minHeight: "min-content",
            position: "relative",
            padding: "12px 0",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <div
              ref={editorRef}
              contentEditable={editing}
              suppressContentEditableWarning
              onBlur={commitHtml}
              onInput={() => {
                setTick((x) => x + 1);
                requestAnimationFrame(measureGutter);
              }}
              onMouseUp={() => requestAnimationFrame(measureGutter)}
              onKeyUp={() => requestAnimationFrame(measureGutter)}
              className="page-flow-editor"
              style={{
                maxWidth: 720,
                margin: "0 auto",
                padding: "4px 16px 48px",
                minHeight: "100%",
                outline: "none",
                fontSize: 15,
                lineHeight: 1.65,
                color: "var(--text-primary)",
                direction: "ltr",
                unicodeBidi: "plaintext",
              }}
            />
          </div>

          <div
            title="Drag to resize tasks panel"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize tasks panel"
            aria-valuemin={MIN_TASKS_PANEL_WIDTH}
            aria-valuemax={MAX_TASKS_PANEL_WIDTH}
            aria-valuenow={tasksPanelWidth}
            tabIndex={0}
            onPointerDown={handleTasksPanelResizePointerDown}
            onPointerMove={handleTasksPanelResizePointerMove}
            onPointerUp={endTasksPanelResize}
            onPointerCancel={endTasksPanelResize}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const step = e.shiftKey ? 32 : 8;
                // ArrowRight should SHRINK the panel; ArrowLeft should EXPAND it.
                const delta = e.key === "ArrowRight" ? -step : step;
                setTasksPanelWidth((w) => {
                  const next = Math.round(
                    Math.min(
                      MAX_TASKS_PANEL_WIDTH,
                      Math.max(MIN_TASKS_PANEL_WIDTH, w + delta)
                    )
                  );
                  tasksPanelWidthCommitRef.current = next;
                  try {
                    localStorage.setItem(
                      TASKS_PANEL_WIDTH_STORAGE_KEY,
                      String(next)
                    );
                  } catch {
                    /* ignore */
                  }
                  return next;
                });
              }
            }}
            style={{
              flexShrink: 0,
              width: 6,
              cursor: "col-resize",
              touchAction: "none",
              alignSelf: "stretch",
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              background: "transparent",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                width: 2,
                alignSelf: "stretch",
                minHeight: 40,
                borderRadius: 1,
                background: "var(--border-subtle)",
                opacity: 0.85,
              }}
            />
          </div>

          <div
            style={{
              width: tasksPanelWidth,
              flexShrink: 0,
              position: "relative",
              borderLeft: "1px solid var(--border-subtle)",
              paddingLeft: 6,
              paddingRight: 6,
              boxSizing: "border-box",
              background: "var(--bg-secondary)",
            }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 80,
                background: "var(--bg-secondary)",
                paddingTop: 6,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 6,
              }}
            >
              <button
                type="button"
                title="Collapse all subtasks"
                aria-label="Collapse all subtasks"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setGlobalSubtasksMode("collapsed");
                  setGlobalSubtasksVersion((v) => v + 1);
                }}
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  borderRadius: 4,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                title="Expand all subtasks"
                aria-label="Expand all subtasks"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setGlobalSubtasksMode("expanded");
                  setGlobalSubtasksVersion((v) => v + 1);
                }}
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  borderRadius: 4,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {markers.length === 0 ? (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  padding: "4px 2px",
                }}
              >
                Linked tasks appear here, aligned to highlights in the text.
              </div>
            ) : (
              markers.map((m, i) => (
                <PageLinkedTaskGutterCard
                  key={m.linkId}
                  m={m}
                  markerIndex={i}
                  tasks={tasks}
                  sections={sections}
                  pageLinkedRootTaskId={pageLinkedRootTaskId}
                  editing={editing}
                  updateTask={updateTask}
                  onRemoveLink={removeLinkById}
                  addWorkspaceUrl={addWorkspaceUrl}
                  onOpenNotes={setNotesTaskId}
                  thumbnailsExpanded={thumbnailsExpanded}
                  globalSubtasksMode={globalSubtasksMode}
                  globalSubtasksVersion={globalSubtasksVersion}
                  onExpandThumbnails={(markerLinkId, hostTaskId, rootTaskId) =>
                    setThumbnailsExpanded((v) => !v)
                  }
                />
              ))
            )}
          </div>
          {thumbPanel &&
            thumbHostTask &&
            thumbRootTask &&
            expandedThumbMarker && (
              <div
                style={{
                  width: 320,
                  flexShrink: 0,
                  position: "relative",
                  borderLeft: "1px solid var(--border-subtle)",
                  paddingLeft: 6,
                  paddingRight: 6,
                  boxSizing: "border-box",
                  background: "var(--bg-secondary)",
                  overflow: "hidden",
                }}
              >
                {/* Graphic separator between task list and expanded thumbnails */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: 2,
                    background:
                      "linear-gradient(to bottom, rgba(244,114,182,0.45), rgba(244,114,182,0.05))",
                    boxShadow: "1px 0 0 rgba(0,0,0,0.05)",
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setThumbPanel(null)}
                  aria-label="Close thumbnails panel"
                  title="Close"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 50,
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ×
                </button>

                <div
                  style={{
                    position: "absolute",
                    top: expandedThumbMarker.top,
                    left: 6,
                    right: 6,
                    height: Math.max(26, expandedThumbMarker.height + 11),
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 6,
                    border: "1px solid var(--border-subtle)",
                    borderLeft: "3px solid rgba(244, 114, 182, 0.75)",
                    background: "var(--bg-primary)",
                    padding: "4px 6px 5px",
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {thumbOrderedTasks.map((task, idx) => {
                      const depthOffset = thumbRootTask.depth ?? 0;
                      const indent = Math.max(0, (task.depth ?? 0) - depthOffset) * 8;
                      const rowItems =
                        thumbHostTask?.workspace?.items.filter(
                          (it) => it.linkedTaskId === task._id
                        ) ?? [];

                      const assetItems = rowItems.filter(
                        (it) =>
                          it.linkRole !== "final" &&
                          (it.type === "image" || it.type === "video")
                      );
                      const finalItems = rowItems.filter(
                        (it) =>
                          it.linkRole === "final" &&
                          (it.type === "image" || it.type === "video")
                      );

                      return (
                        <div
                          key={task._id}
                          style={{
                            borderTop:
                              idx > 0 ? "1px solid var(--border-subtle)" : undefined,
                            paddingTop: idx > 0 ? 5 : 0,
                            marginLeft: indent,
                          }}
                        >
                          <div style={{ height: 22 }} aria-hidden />

                          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                              Assets
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                alignItems: "center",
                                minHeight: 34,
                              }}
                            >
                              {assetItems.length > 0
                                ? assetItems.map((it) => renderThumb(it, "amber"))
                                : null}
                            </div>

                            <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                              Final
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                alignItems: "center",
                                minHeight: 34,
                              }}
                            >
                              {finalItems.length > 0
                                ? finalItems.map((it) => renderThumb(it, "green"))
                                : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
    <TaskNotesModal
      open={notesTaskId !== null}
      taskTitle={notesTask?.title ?? ""}
      notes={notesTask?.notes ?? ""}
      onClose={() => setNotesTaskId(null)}
    />
    </>
  );
}
