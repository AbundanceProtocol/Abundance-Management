"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSearchParams } from "next/navigation";
import { useMindMaps, useTasks } from "@/lib/hooks";
import {
  DEFAULT_MIND_MAP_EDGE_LINE_TYPE,
  type MindMapDocument,
  type MindMapEdgeLineType,
  type MindMapLinkSide,
  type MindMapNode,
  type MindMapNodeKind,
} from "@/lib/mindMapTypes";
import type { TaskItem } from "@/lib/types";
import { flattenTasksTree } from "@/lib/timelineUtils";
import { AppNavTasksPages } from "./AppNavTasksPages";
import {
  Plus,
  Trash,
  Link as LinkIcon,
  Check,
  ChevronRight,
  ChevronDown,
  Eye,
  FileText,
  Clock,
  Calendar,
  Flag,
} from "./Icons";

const EDGE_COLORS = [
  "var(--accent-blue)",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
];

function edgeColor(index: number) {
  return EDGE_COLORS[index % EDGE_COLORS.length];
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Native `<option>` labels: em space indent + branch glyph (matches task detail picker). */
function formatMindMapTaskSelectLabel(t: TaskItem): string {
  const title = t.title.trim() || "Untitled";
  const d = Math.min(t.depth ?? 0, 32);
  const indent = "\u2003".repeat(d);
  const branch = d > 0 ? "\u21B3\u00A0" : "";
  return `${indent}${branch}${title}`;
}

const KIND_STYLE: Record<MindMapNodeKind, React.CSSProperties> = {
  idea: {
    background: "var(--bg-secondary)",
    border: "2px solid var(--accent-blue)",
    color: "var(--text-primary)",
  },
  task: {
    background: "rgba(75, 156, 245, 0.15)",
    border: "2px solid var(--accent-blue)",
    color: "var(--accent-blue)",
  },
  note: {
    background: "rgba(168, 85, 247, 0.15)",
    border: "2px solid var(--accent-purple)",
    color: "var(--accent-purple)",
  },
  artifact: {
    background: "rgba(245, 158, 11, 0.15)",
    border: "2px solid var(--accent-amber)",
    color: "var(--accent-amber)",
  },
};

const KIND_LABELS: Record<MindMapNodeKind, string> = {
  idea: "Idea",
  task: "Task",
  note: "Note",
  artifact: "URL",
};

/** Path shape for parent → child connectors (Bezier first — app default). */
const EDGE_LINE_LABELS: Record<MindMapEdgeLineType, string> = {
  default: "Bezier curve",
  simplebezier: "Simple curve",
  smoothstep: "Smooth steps",
  step: "Orthogonal",
  straight: "Straight",
};

function mapDefaultEdgeLineType(doc: MindMapDocument | null | undefined): MindMapEdgeLineType {
  return doc?.defaultEdgeLineType ?? DEFAULT_MIND_MAP_EDGE_LINE_TYPE;
}

function effectiveParentEdgeLineType(
  n: MindMapNode,
  mapDefault: MindMapEdgeLineType,
): MindMapEdgeLineType {
  return n.parentEdgeLineType ?? mapDefault;
}

function parentEdgeStrokeStyle(n: MindMapNode): Pick<
  React.CSSProperties,
  "strokeWidth" | "strokeDasharray"
> {
  if (n.parentEdgeStroke === "dashed") {
    return { strokeWidth: 2, strokeDasharray: "8 5" };
  }
  return { strokeWidth: 2 };
}

const DEFAULT_LINK_SOURCE_SIDE: MindMapLinkSide = "right";
const DEFAULT_LINK_TARGET_SIDE: MindMapLinkSide = "left";

const LINK_SIDE_ORDER: MindMapLinkSide[] = ["top", "right", "bottom", "left"];

const LINK_SIDE_LABELS: Record<MindMapLinkSide, string> = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

function effectiveLinkSourceSide(n: MindMapNode): MindMapLinkSide {
  return n.parentLinkSourceSide ?? DEFAULT_LINK_SOURCE_SIDE;
}

function effectiveLinkTargetSide(n: MindMapNode): MindMapLinkSide {
  return n.parentLinkTargetSide ?? DEFAULT_LINK_TARGET_SIDE;
}

function sourceHandleId(side: MindMapLinkSide): string {
  return `out-${side}`;
}

function targetHandleId(side: MindMapLinkSide): string {
  return `in-${side}`;
}

function parseSideFromHandle(
  h: string | null | undefined,
  role: "out" | "in",
): MindMapLinkSide | null {
  const prefix = `${role}-`;
  if (!h?.startsWith(prefix)) return null;
  const rest = h.slice(prefix.length);
  if (
    rest === "top" ||
    rest === "right" ||
    rest === "bottom" ||
    rest === "left"
  ) {
    return rest;
  }
  return null;
}

const HANDLE_DOT: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: "50%",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--accent-blue)",
};

/* ─── Custom node component ─── */

type MindMapNodeData = {
  label: string;
  kind: MindMapNodeKind;
  url?: string | null;
  taskId?: string | null;
  taskCompleted?: boolean;
  selected?: boolean;
  onLabelChange: (id: string, label: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onSelect: (id: string) => void;
};

function MindMapNodeComponent({ id, data }: NodeProps<Node<MindMapNodeData>>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(data.label);
  }, [data.label]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== data.label) {
      data.onLabelChange(id, draft.trim());
    }
  };

  const style = KIND_STYLE[data.kind] ?? KIND_STYLE.idea;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        data.onSelect(id);
      }}
      style={{
        ...style,
        borderRadius: 24,
        padding: "10px 20px",
        minWidth: 100,
        maxWidth: 260,
        textAlign: "center",
        fontSize: 13,
        fontWeight: 500,
        position: "relative",
        cursor: "grab",
        boxShadow: data.selected
          ? "0 0 0 3px var(--accent-blue), 0 2px 8px rgba(0,0,0,0.25)"
          : "0 2px 8px rgba(0,0,0,0.25)",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="in-top"
        className="mindmap-handle mindmap-handle-target"
        style={{ ...HANDLE_DOT, left: "50%", opacity: 0.55, transform: "translateX(-50%)" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="out-top"
        className="mindmap-handle mindmap-handle-source"
        style={{ ...HANDLE_DOT, left: "50%", opacity: 0.55, transform: "translateX(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="in-bottom"
        className="mindmap-handle mindmap-handle-target"
        style={{ ...HANDLE_DOT, left: "50%", opacity: 0.55, transform: "translateX(-50%)" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        className="mindmap-handle mindmap-handle-source"
        style={{ ...HANDLE_DOT, left: "50%", opacity: 0.55, transform: "translateX(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in-left"
        className="mindmap-handle mindmap-handle-target"
        style={{ ...HANDLE_DOT, top: "50%", opacity: 0.55, transform: "translateY(-50%)" }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="out-left"
        className="mindmap-handle mindmap-handle-source"
        style={{ ...HANDLE_DOT, top: "50%", opacity: 0.55, transform: "translateY(-50%)" }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="in-right"
        className="mindmap-handle mindmap-handle-target"
        style={{ ...HANDLE_DOT, top: "50%", opacity: 0.55, transform: "translateY(-50%)" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        className="mindmap-handle mindmap-handle-source"
        style={{ ...HANDLE_DOT, top: "50%", opacity: 0.55, transform: "translateY(-50%)" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
        {data.kind === "task" && data.taskId != null && (
          <button
            type="button"
            title={data.taskCompleted ? "Mark incomplete" : "Mark complete"}
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleComplete(id);
            }}
            style={{
              flexShrink: 0,
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: data.taskCompleted
                ? "2px solid var(--accent-green)"
                : "2px solid var(--text-muted)",
              background: data.taskCompleted
                ? "rgba(34, 197, 94, 0.2)"
                : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              color: "var(--accent-green)",
            }}
          >
            {data.taskCompleted && <Check size={10} />}
          </button>
        )}

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(data.label);
                setEditing(false);
              }
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              fontSize: "inherit",
              fontWeight: "inherit",
              textAlign: "center",
              width: "100%",
              outline: "none",
              padding: 0,
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            style={{
              userSelect: "none",
              textDecoration: data.taskCompleted ? "line-through" : "none",
              opacity: data.taskCompleted ? 0.6 : 1,
            }}
          >
            {data.label || "Untitled"}
            {data.kind === "artifact" && data.url && (
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  marginLeft: 6,
                  color: "inherit",
                  opacity: 0.7,
                  display: "inline-flex",
                  verticalAlign: "middle",
                }}
              >
                <LinkIcon size={12} />
              </a>
            )}
          </span>
        )}
      </div>

      {/* Hover actions */}
      <div
        className="mindmap-node-actions"
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          display: "flex",
          gap: 2,
          opacity: 0,
          transition: "opacity 0.15s",
        }}
      >
        <button
          type="button"
          title="Add child"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddChild(id);
          }}
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            color: "var(--accent-green)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Plus size={12} />
        </button>
        <button
          type="button"
          title="Delete node"
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete(id);
          }}
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            color: "var(--accent-red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Trash size={10} />
        </button>
      </div>
    </div>
  );
}

const NODE_TYPES: NodeTypes = { mindMapNode: MindMapNodeComponent };

/* ─── Helpers: MindMapNode[] <-> React Flow nodes/edges ─── */

function toFlowNodes(
  mapNodes: MindMapNode[],
  callbacks: {
    onLabelChange: (id: string, label: string) => void;
    onAddChild: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleComplete: (id: string) => void;
    onSelect: (id: string) => void;
  },
  taskMap?: Map<string, TaskItem>,
  selectedNodeId?: string | null,
): Node[] {
  return mapNodes.map((n) => {
    const linkedTask = n.taskId && taskMap ? taskMap.get(n.taskId) : undefined;
    return {
      id: n.id,
      type: "mindMapNode",
      position: { x: n.x, y: n.y },
      data: {
        label: linkedTask ? (linkedTask.title || n.label) : n.label,
        kind: n.kind,
        url: n.url,
        taskId: n.taskId,
        taskCompleted: linkedTask?.completed ?? false,
        selected: n.id === selectedNodeId,
        ...callbacks,
      } satisfies MindMapNodeData,
    };
  });
}

function toFlowEdges(mapNodes: MindMapNode[], mapDefault: MindMapEdgeLineType): Edge[] {
  let colorIdx = 0;
  return mapNodes
    .filter((n) => n.parentId)
    .map((n) => {
      const c = edgeColor(colorIdx++);
      const lineType = effectiveParentEdgeLineType(n, mapDefault);
      return {
        id: `e-${n.parentId}-${n.id}`,
        source: n.parentId!,
        target: n.id,
        sourceHandle: sourceHandleId(effectiveLinkSourceSide(n)),
        targetHandle: targetHandleId(effectiveLinkTargetSide(n)),
        type: lineType,
        animated: false,
        style: { stroke: c, ...parentEdgeStrokeStyle(n) },
        markerEnd: { type: MarkerType.ArrowClosed, color: c },
      };
    });
}

/* ─── Auto-layout for task import ─── */

function autoLayoutTree(nodes: MindMapNode[]): MindMapNode[] {
  const childrenOf = new Map<string | null, MindMapNode[]>();
  for (const n of nodes) {
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n);
    childrenOf.set(n.parentId, arr);
  }
  const positioned = new Map<string, { x: number; y: number }>();
  const H_GAP = 250;
  const V_GAP = 70;
  let nextY = 0;

  function layout(nodeId: string, depth: number) {
    const children = childrenOf.get(nodeId) ?? [];
    if (children.length === 0) {
      positioned.set(nodeId, { x: depth * H_GAP, y: nextY });
      nextY += V_GAP;
      return;
    }
    for (const c of children) layout(c.id, depth + 1);
    const firstChild = positioned.get(children[0].id)!;
    const lastChild = positioned.get(children[children.length - 1].id)!;
    positioned.set(nodeId, {
      x: depth * H_GAP,
      y: (firstChild.y + lastChild.y) / 2,
    });
  }

  const roots = nodes.filter((n) => !n.parentId);
  for (const r of roots) layout(r.id, 0);
  for (const n of nodes) {
    if (!positioned.has(n.id)) positioned.set(n.id, { x: 0, y: nextY });
    nextY += V_GAP;
  }

  return nodes.map((n) => {
    const pos = positioned.get(n.id) ?? { x: 0, y: 0 };
    return { ...n, x: pos.x, y: pos.y };
  });
}

/* ─── Build mind map from task subtree ─── */

export function buildMindMapFromTasks(
  rootTaskId: string,
  tasks: { _id: string; parentId: string | null; title: string }[],
): MindMapNode[] {
  const relevant = new Set<string>();
  relevant.add(rootTaskId);
  let added = true;
  while (added) {
    added = false;
    for (const t of tasks) {
      if (t.parentId && relevant.has(t.parentId) && !relevant.has(t._id)) {
        relevant.add(t._id);
        added = true;
      }
    }
  }
  const raw: MindMapNode[] = tasks
    .filter((t) => relevant.has(t._id))
    .map((t) => ({
      id: newId(),
      parentId: null,
      kind: "task" as const,
      x: 0,
      y: 0,
      label: t.title || "Untitled",
      taskId: t._id,
      visibleOnBoard: true,
    }));
  const taskIdToNodeId = new Map(raw.map((n) => [n.taskId!, n.id]));
  for (const n of raw) {
    const task = tasks.find((t) => t._id === n.taskId);
    if (task?.parentId && taskIdToNodeId.has(task.parentId)) {
      n.parentId = taskIdToNodeId.get(task.parentId)!;
    }
  }
  return autoLayoutTree(raw);
}

/**
 * Add mind-map task nodes for direct subtasks of `parentTaskId` not already represented on the map.
 */
export function importTaskSubtasksIntoMap(
  parentTaskId: string,
  map: MindMapDocument,
  allTasks: { _id: string; parentId: string | null; title: string }[],
): MindMapDocument | null {
  const parentNode = map.nodes.find((n) => n.taskId === parentTaskId);
  if (!parentNode) return null;

  const subtasks = allTasks.filter((t) => t.parentId === parentTaskId);
  if (subtasks.length === 0) return map;

  const onMap = new Set(
    map.nodes.map((n) => n.taskId).filter((id): id is string => !!id),
  );

  const newNodes: MindMapNode[] = [...map.nodes];
  let idx = 0;
  const XOFF = 250;
  const YSTEP = 72;
  let anyAdded = false;

  for (const st of subtasks) {
    if (onMap.has(st._id)) continue;
    onMap.add(st._id);
    anyAdded = true;
    newNodes.push({
      id: newId(),
      parentId: parentNode.id,
      kind: "task",
      x: parentNode.x + XOFF,
      y: parentNode.y + idx * YSTEP,
      label: st.title || "Untitled",
      taskId: st._id,
      visibleOnBoard: true,
    });
    idx += 1;
  }

  if (!anyAdded) return map;

  return {
    ...map,
    nodes: newNodes,
    updatedAt: new Date().toISOString(),
  };
}

/* ─── Detail panel for selected node ─── */

function NodeDetailPanel({
  node,
  mapDefaultEdgeLineType: mapEdgeDefault,
  allTasks,
  linkedTask,
  onClose,
  onUpdateNode,
  onToggleComplete,
  onToggleBoardVisibility,
  onImportLinkedSubtasks,
}: {
  node: MindMapNode;
  mapDefaultEdgeLineType: MindMapEdgeLineType;
  allTasks: TaskItem[];
  linkedTask: TaskItem | undefined;
  onClose: () => void;
  onUpdateNode: (id: string, patch: Partial<MindMapNode>) => void;
  onToggleComplete: () => void;
  onToggleBoardVisibility: () => void;
  onImportLinkedSubtasks: () => string;
}) {
  const [label, setLabel] = useState(node.label);
  const [body, setBody] = useState(node.body ?? "");
  const [url, setUrl] = useState(node.url ?? "");
  const [collapsed, setCollapsed] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskImportNote, setTaskImportNote] = useState<string | null>(null);

  useEffect(() => {
    setLabel(linkedTask ? (linkedTask.title || node.label) : node.label);
    setBody(node.body ?? "");
    setUrl(node.url ?? "");
  }, [node.id, node.label, node.body, node.url, linkedTask]);

  const isTask = node.kind === "task" && !!node.taskId;
  const boardVisible = node.visibleOnBoard !== false;

  useEffect(() => {
    setTaskSearch("");
    setTaskImportNote(null);
  }, [node.id]);

  const taskMatches = useMemo(() => {
    if (node.kind !== "task") return [];
    const q = taskSearch.trim().toLowerCase();
    if (!q) return [];
    const starts: TaskItem[] = [];
    const contains: TaskItem[] = [];
    for (const t of allTasks) {
      const title = (t.title ?? "").toLowerCase();
      if (!title) continue;
      if (title.startsWith(q)) starts.push(t);
      else if (title.includes(q)) contains.push(t);
    }
    const ranked = [...starts, ...contains];
    return ranked.slice(0, 12);
  }, [allTasks, taskSearch, node.kind]);

  const tasksForSelect = useMemo(() => {
    const bySection = new Map<string, TaskItem[]>();
    for (const t of allTasks) {
      const sid = t.sectionId ?? "";
      if (!bySection.has(sid)) bySection.set(sid, []);
      bySection.get(sid)!.push(t);
    }
    const keys = [...bySection.keys()].sort((a, b) => a.localeCompare(b));
    const out: TaskItem[] = [];
    for (const k of keys) {
      out.push(...flattenTasksTree(bySection.get(k)!, "manual"));
    }
    return out;
  }, [allTasks]);

  const linkedTaskId = node.taskId ?? "";
  const linkedTaskMissing =
    Boolean(linkedTaskId) && !allTasks.some((t) => t._id === linkedTaskId);

  const LBL = { fontSize: 11, color: "var(--text-muted)", marginBottom: 4 } as const;
  const TOGGLE: React.CSSProperties = {
    width: 36,
    height: 20,
    borderRadius: 10,
    border: "1px solid var(--border-color)",
    position: "relative",
    transition: "background 0.2s",
    padding: 0,
    cursor: "pointer",
    flexShrink: 0,
  };

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-primary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 0,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          {KIND_LABELS[node.kind]} Details
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          &times;
        </button>
      </div>

      {!collapsed && (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Label / title */}
          <div>
            <div style={LBL}>Label</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (label.trim() !== node.label) {
                  onUpdateNode(node.id, { label: label.trim() });
                }
              }}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <div style={LBL}>Type</div>
            <select
              value={node.kind}
              onChange={(e) => {
                const nextKind = e.target.value as MindMapNodeKind;
                if (nextKind === node.kind) return;
                if (nextKind === "task") {
                  onUpdateNode(node.id, { kind: nextKind });
                  return;
                }
                onUpdateNode(node.id, { kind: nextKind, taskId: null });
              }}
              style={{
                width: "100%",
                fontSize: 12,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            >
              {(Object.keys(KIND_LABELS) as MindMapNodeKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {node.kind === "task" && (
            <div
              style={{
                padding: "10px 0 0",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={LBL}>Linked task</div>
              <select
                value={linkedTaskId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    onUpdateNode(node.id, { taskId: null });
                    return;
                  }
                  const t = allTasks.find((x) => x._id === id);
                  onUpdateNode(node.id, {
                    taskId: id,
                    label: (t?.title ?? "").trim() || node.label,
                  });
                }}
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  boxSizing: "border-box",
                }}
              >
                <option value="">— None —</option>
                {linkedTaskMissing ? (
                  <option value={linkedTaskId}>Task not in list (stale link)</option>
                ) : null}
                {tasksForSelect.map((t) => (
                  <option key={t._id} value={t._id}>
                    {formatMindMapTaskSelectLabel(t)}
                  </option>
                ))}
              </select>
              <div style={LBL}>Or search</div>
              <input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks..."
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  boxSizing: "border-box",
                }}
              />
              {taskMatches.length > 0 && (
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--bg-tertiary)",
                  }}
                >
                  {taskMatches.map((t) => (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => {
                        onUpdateNode(node.id, {
                          taskId: t._id,
                          label: t.title || node.label,
                        });
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        background: "transparent",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          minWidth: 42,
                        }}
                      >
                        {t.completed ? "Done" : "Todo"}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={t.title}
                      >
                        {(t.depth > 0 ? `${"—".repeat(Math.min(t.depth, 6))} ` : "") +
                          (t.title || "Untitled")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {taskSearch.trim() && taskMatches.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  No matches
                </div>
              )}
              {linkedTask && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setTaskImportNote(onImportLinkedSubtasks());
                    }}
                    style={{
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      alignSelf: "flex-start",
                    }}
                  >
                    Import subtasks
                  </button>
                  {taskImportNote && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {taskImportNote}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {node.parentId && (
            <div
              style={{
                padding: "10px 0 0",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={LBL}>Connector from parent</div>
              <select
                value={effectiveParentEdgeLineType(node, mapEdgeDefault)}
                onChange={(e) => {
                  const v = e.target.value as MindMapEdgeLineType;
                  onUpdateNode(node.id, {
                    parentEdgeLineType: v === mapEdgeDefault ? null : v,
                  });
                }}
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                }}
              >
                {(Object.keys(EDGE_LINE_LABELS) as MindMapEdgeLineType[]).map((k) => (
                  <option key={k} value={k}>
                    {EDGE_LINE_LABELS[k]}
                  </option>
                ))}
              </select>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={node.parentEdgeStroke === "dashed"}
                  onChange={() =>
                    onUpdateNode(node.id, {
                      parentEdgeStroke:
                        node.parentEdgeStroke === "dashed" ? null : "dashed",
                    })
                  }
                />
                Dashed line
              </label>
              <div style={LBL}>Exit from parent (side)</div>
              {node.taskId ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    padding: "6px 0",
                  }}
                >
                  {LINK_SIDE_LABELS[effectiveLinkSourceSide(node)]} — linked tasks use
                  the Tasks hierarchy; drag from the same parent to tweak anchors only.
                </div>
              ) : (
                <select
                  value={effectiveLinkSourceSide(node)}
                  onChange={(e) => {
                    const v = e.target.value as MindMapLinkSide;
                    onUpdateNode(node.id, {
                      parentLinkSourceSide:
                        v === DEFAULT_LINK_SOURCE_SIDE ? null : v,
                    });
                  }}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {LINK_SIDE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {LINK_SIDE_LABELS[s]}
                    </option>
                  ))}
                </select>
              )}
              <div style={LBL}>Enter this node (side)</div>
              {node.taskId ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    padding: "6px 0",
                  }}
                >
                  {LINK_SIDE_LABELS[effectiveLinkTargetSide(node)]}
                </div>
              ) : (
                <select
                  value={effectiveLinkTargetSide(node)}
                  onChange={(e) => {
                    const v = e.target.value as MindMapLinkSide;
                    onUpdateNode(node.id, {
                      parentLinkTargetSide:
                        v === DEFAULT_LINK_TARGET_SIDE ? null : v,
                    });
                  }}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {LINK_SIDE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {LINK_SIDE_LABELS[s]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {isTask && linkedTask && (
            <>
              {/* Completion toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Check size={14} />
                  Completed
                </span>
                <button
                  type="button"
                  onClick={onToggleComplete}
                  style={{
                    ...TOGGLE,
                    background: linkedTask.completed
                      ? "var(--accent-green)"
                      : "var(--bg-tertiary)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: linkedTask.completed ? 18 : 2,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "white",
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </div>

              {/* Board visibility toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Eye size={14} />
                  Show on Tasks board
                </span>
                <button
                  type="button"
                  onClick={onToggleBoardVisibility}
                  style={{
                    ...TOGGLE,
                    background: boardVisible
                      ? "var(--accent-blue)"
                      : "var(--bg-tertiary)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: boardVisible ? 18 : 2,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "white",
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
                {boardVisible
                  ? "This task appears on the Tasks board and follows board parent/child hierarchy."
                  : "This task is mind-map-only and hidden from the Tasks board."}
              </p>

              {/* Task meta */}
              {linkedTask.priority && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Flag size={12} />
                  Priority: {linkedTask.priority}
                </div>
              )}
              {linkedTask.dueDate && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={12} />
                  Due: {linkedTask.dueDate}
                </div>
              )}
              {linkedTask.timeEstimate != null && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={12} />
                  Estimate: {linkedTask.timeEstimate} {linkedTask.timeUnit}
                </div>
              )}
              {linkedTask.notes && (
                <div>
                  <div style={LBL}>
                    <FileText size={11} /> Notes
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      background: "var(--bg-tertiary)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      whiteSpace: "pre-wrap",
                      maxHeight: 160,
                      overflowY: "auto",
                    }}
                  >
                    {linkedTask.notes}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Note body */}
          {node.kind === "note" && (
            <div>
              <div style={LBL}>Body</div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => {
                  if (body !== (node.body ?? "")) {
                    onUpdateNode(node.id, { body });
                  }
                }}
                rows={6}
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>
          )}

          {/* Artifact URL */}
          {node.kind === "artifact" && (
            <div>
              <div style={LBL}>URL</div>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => {
                  if (url.trim() !== (node.url ?? "")) {
                    onUpdateNode(node.id, { url: url.trim() });
                  }
                }}
                placeholder="https://..."
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  boxSizing: "border-box",
                }}
              />
              {url.trim() && (
                <a
                  href={url.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    color: "var(--accent-blue)",
                    marginTop: 4,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <LinkIcon size={11} /> Open link
                </a>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

/* ─── Main view ─── */

export default function MindMapsView() {
  const searchParams = useSearchParams();
  const initialMapId = searchParams.get("mapId");
  const rootTaskParam = searchParams.get("rootTask");
  const { maps, upsertMap, deleteMap, loading: mapsLoading } = useMindMaps();
  const { tasks, updateTask, loading: tasksLoading } = useTasks();

  const [selectedMapId, setSelectedMapId] = useState<string | null>(initialMapId);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [addKind, setAddKind] = useState<MindMapNodeKind>("idea");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const selectedMap = useMemo(
    () => maps.find((m) => m.id === selectedMapId) ?? null,
    [maps, selectedMapId],
  );

  const taskMap = useMemo(
    () => new Map(tasks.map((t) => [t._id, t])),
    [tasks],
  );

  const selectedNode = useMemo(
    () => selectedMap?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [selectedMap, selectedNodeId],
  );

  const selectedLinkedTask = useMemo(
    () => (selectedNode?.taskId ? taskMap.get(selectedNode.taskId) : undefined),
    [selectedNode, taskMap],
  );

  const mapEdgeDefault = mapDefaultEdgeLineType(selectedMap);

  /* ─── callbacks wired into nodes ─── */

  const currentMapRef = useRef<MindMapDocument | null>(null);
  currentMapRef.current = selectedMap;

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const map = currentMapRef.current;
      const filtered = changes.filter((ch) => {
        if (ch.type !== "remove") return true;
        if (!map) return true;
        const parsed = /^e-(.+)-(.+)$/.exec(ch.id);
        if (!parsed) return true;
        const targetId = parsed[2];
        const targetNode = map.nodes.find((n) => n.id === targetId);
        if (targetNode?.taskId) return false;
        return true;
      });
      onEdgesChangeBase(filtered);
    },
    [onEdgesChangeBase],
  );

  const setMapDefaultEdgeLineType = useCallback(
    (v: MindMapEdgeLineType) => {
      const map = currentMapRef.current;
      if (!map) return;
      const nextField = v === DEFAULT_MIND_MAP_EDGE_LINE_TYPE ? null : v;
      const updated: MindMapDocument = {
        ...map,
        defaultEdgeLineType: nextField,
        updatedAt: new Date().toISOString(),
      };
      currentMapRef.current = updated;
      upsertMap(updated);
      setEdges(toFlowEdges(map.nodes, mapDefaultEdgeLineType(updated)));
    },
    [upsertMap, setEdges],
  );

  const scheduleSave = useCallback(
    (updatedNodes: MindMapNode[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const map = currentMapRef.current;
        if (!map) return;
        upsertMap({ ...map, nodes: updatedNodes, updatedAt: new Date().toISOString() });
      }, 600);
    },
    [upsertMap],
  );

  const getLatestMapNodes = useCallback((): MindMapNode[] => {
    return currentMapRef.current?.nodes ?? [];
  }, []);

  const onLabelChange = useCallback(
    (id: string, label: string) => {
      const prev = getLatestMapNodes();
      const next = prev.map((n) => (n.id === id ? { ...n, label } : n));
      const map = currentMapRef.current;
      if (map) {
        const updated = { ...map, nodes: next, updatedAt: new Date().toISOString() };
        currentMapRef.current = updated;
        upsertMap(updated);
      }
      setNodes((nds) =>
        nds.map((nd) =>
          nd.id === id ? { ...nd, data: { ...nd.data, label } } : nd,
        ),
      );
    },
    [getLatestMapNodes, upsertMap, setNodes],
  );

  const onToggleComplete = useCallback(
    (nodeId: string) => {
      const mapNodes = getLatestMapNodes();
      const node = mapNodes.find((n) => n.id === nodeId);
      if (!node?.taskId) return;
      const task = taskMap.get(node.taskId);
      if (!task) return;
      updateTask({ _id: task._id, completed: !task.completed });
    },
    [getLatestMapNodes, taskMap, updateTask],
  );

  const onSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const nodeCallbacks = useMemo(
    () => ({
      onLabelChange,
      onAddChild: null as unknown as (id: string) => void,
      onDelete: null as unknown as (id: string) => void,
      onToggleComplete,
      onSelect: onSelectNode,
    }),
    [onLabelChange, onToggleComplete, onSelectNode],
  );

  const onAddChild = useCallback(
    (parentId: string) => {
      const mapNodes = getLatestMapNodes();
      const parent = mapNodes.find((n) => n.id === parentId);
      const siblings = mapNodes.filter((n) => n.parentId === parentId);
      const child: MindMapNode = {
        id: newId(),
        parentId,
        kind: addKind,
        x: (parent?.x ?? 0) + 250,
        y: (parent?.y ?? 0) + siblings.length * 70,
        label: "",
        url: addKind === "artifact" ? "" : null,
      };
      const next = [...mapNodes, child];
      const map = currentMapRef.current;
      if (map) {
        const updated = { ...map, nodes: next, updatedAt: new Date().toISOString() };
        currentMapRef.current = updated;
        upsertMap(updated);
      }
      const cbs = { ...nodeCallbacks, onAddChild, onDelete: onDeleteNode };
      setNodes((nds) => [
        ...nds,
        ...toFlowNodes([child], cbs, taskMap, selectedNodeId),
      ]);
      const md = mapDefaultEdgeLineType(currentMapRef.current);
      setEdges((eds) => [...eds, ...toFlowEdges([child], md)]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      getLatestMapNodes,
      addKind,
      upsertMap,
      setNodes,
      setEdges,
      taskMap,
      nodeCallbacks,
      selectedNodeId,
    ],
  );

  const onDeleteNode = useCallback(
    (id: string) => {
      const mapNodes = getLatestMapNodes();
      const toRemove = new Set<string>();
      toRemove.add(id);
      let added = true;
      while (added) {
        added = false;
        for (const n of mapNodes) {
          if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
            toRemove.add(n.id);
            added = true;
          }
        }
      }
      const next = mapNodes.filter((n) => !toRemove.has(n.id));
      const map = currentMapRef.current;
      if (map) {
        const updated = { ...map, nodes: next, updatedAt: new Date().toISOString() };
        currentMapRef.current = updated;
        upsertMap(updated);
      }
      if (selectedNodeId && toRemove.has(selectedNodeId)) setSelectedNodeId(null);
      setNodes((nds) => nds.filter((n) => !toRemove.has(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target)),
      );
    },
    [getLatestMapNodes, upsertMap, setNodes, setEdges, selectedNodeId],
  );

  const fullCallbacks = useMemo(
    () => ({ ...nodeCallbacks, onAddChild, onDelete: onDeleteNode }),
    [nodeCallbacks, onAddChild, onDeleteNode],
  );

  /* ─── Sync flow nodes when selected map changes ─── */

  useEffect(() => {
    if (!selectedMap) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes(toFlowNodes(selectedMap.nodes, fullCallbacks, taskMap, selectedNodeId));
    setEdges(toFlowEdges(selectedMap.nodes, mapDefaultEdgeLineType(selectedMap)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMapId, selectedMap?.updatedAt, selectedMap?.nodes.length, taskMap, selectedNodeId]);

  /* ─── Handle initial deep links ─── */

  useEffect(() => {
    if (initializedRef.current) return;
    if (mapsLoading || tasksLoading) return;
    initializedRef.current = true;

    if (initialMapId && maps.some((m) => m.id === initialMapId)) {
      setSelectedMapId(initialMapId);
      return;
    }
    if (rootTaskParam) {
      const existing = maps.find((m) => m.anchorTaskId === rootTaskParam);
      if (existing) {
        setSelectedMapId(existing.id);
        return;
      }
      const task = tasks.find((t) => t._id === rootTaskParam);
      if (task) {
        const mapNodes = buildMindMapFromTasks(rootTaskParam, tasks);
        const mapDoc: MindMapDocument = {
          id: newId(),
          title: task.title || "Mind Map",
          rootNodeId: mapNodes[0]?.id ?? null,
          anchorTaskId: rootTaskParam,
          nodes: mapNodes,
          updatedAt: new Date().toISOString(),
        };
        upsertMap(mapDoc);
        setSelectedMapId(mapDoc.id);
      }
    }
  }, [mapsLoading, tasksLoading, maps, tasks, initialMapId, rootTaskParam, upsertMap]);

  /* ─── Persist position changes on drag end ─── */

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const mapNodes = getLatestMapNodes();
      const next = mapNodes.map((n) =>
        n.id === node.id ? { ...n, x: node.position.x, y: node.position.y } : n,
      );
      scheduleSave(next);
    },
    [getLatestMapNodes, scheduleSave],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const lineType = mapDefaultEdgeLineType(currentMapRef.current);
      const mapNodes = getLatestMapNodes();
      const targetBefore = mapNodes.find((n) => n.id === params.target);
      const sourceSide =
        parseSideFromHandle(params.sourceHandle, "out") ?? DEFAULT_LINK_SOURCE_SIDE;
      const targetSide =
        parseSideFromHandle(params.targetHandle, "in") ?? DEFAULT_LINK_TARGET_SIDE;

      if (
        targetBefore?.taskId &&
        targetBefore.parentId &&
        params.source === targetBefore.parentId
      ) {
        const next = mapNodes.map((n) =>
          n.id === params.target
            ? {
                ...n,
                parentLinkSourceSide: sourceSide,
                parentLinkTargetSide: targetSide,
              }
            : n,
        );
        const map = currentMapRef.current;
        if (map) {
          const updated: MindMapDocument = {
            ...map,
            nodes: next,
            updatedAt: new Date().toISOString(),
          };
          currentMapRef.current = updated;
          upsertMap(updated);
          setEdges(toFlowEdges(next, mapDefaultEdgeLineType(updated)));
        }
        return;
      }

      const next = mapNodes.map((n) =>
        n.id === params.target
          ? {
              ...n,
              parentId: params.source ?? n.parentId,
              parentEdgeLineType: null,
              parentLinkSourceSide: sourceSide,
              parentLinkTargetSide: targetSide,
            }
          : n,
      );
      const childNode = next.find((n) => n.id === params.target);
      const stroke = childNode
        ? parentEdgeStrokeStyle(childNode)
        : { strokeWidth: 2 as const };
      setEdges((eds) => {
        const c = edgeColor(eds.length);
        return addEdge(
          {
            ...params,
            type: lineType,
            style: { stroke: c, ...stroke },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: c,
            },
          },
          eds,
        );
      });
      scheduleSave(next);
    },
    [setEdges, getLatestMapNodes, scheduleSave, upsertMap],
  );

  const isValidConnection = useCallback((edge: Edge | Connection) => {
    if (edge.source && edge.target && edge.source === edge.target) return false;
    const sh = edge.sourceHandle ?? "";
    const th = edge.targetHandle ?? "";
    if (!(sh.startsWith("out-") && th.startsWith("in-"))) return false;
    const map = currentMapRef.current;
    if (!map || !edge.target) return false;
    const targetNode = map.nodes.find((n) => n.id === edge.target);
    if (targetNode?.taskId) {
      if (targetNode.parentId == null) return true;
      if (targetNode.parentId === edge.source) return true;
      return false;
    }
    return true;
  }, []);

  /* ─── Map CRUD ─── */

  const createMap = useCallback(() => {
    const rootNode: MindMapNode = {
      id: newId(),
      parentId: null,
      kind: "idea",
      x: 400,
      y: 300,
      label: "New Idea",
    };
    const doc: MindMapDocument = {
      id: newId(),
      title: "Untitled Map",
      rootNodeId: rootNode.id,
      anchorTaskId: null,
      nodes: [rootNode],
      updatedAt: new Date().toISOString(),
    };
    upsertMap(doc);
    setSelectedMapId(doc.id);
  }, [upsertMap]);

  const handleDeleteMap = useCallback(
    (id: string) => {
      deleteMap(id);
      if (selectedMapId === id) {
        setSelectedMapId(null);
        setSelectedNodeId(null);
      }
    },
    [deleteMap, selectedMapId],
  );

  const addRootNode = useCallback(() => {
    if (!selectedMap) return;
    const rootNode: MindMapNode = {
      id: newId(),
      parentId: null,
      kind: addKind,
      x: 400,
      y: (selectedMap.nodes.length + 1) * 80,
      label: "",
      url: addKind === "artifact" ? "" : null,
    };
    const next = [...selectedMap.nodes, rootNode];
    const updated = { ...selectedMap, nodes: next, updatedAt: new Date().toISOString() };
    upsertMap(updated);
    setNodes((nds) => [
      ...nds,
      ...toFlowNodes([rootNode], fullCallbacks, taskMap, selectedNodeId),
    ]);
  }, [selectedMap, addKind, upsertMap, setNodes, fullCallbacks, taskMap, selectedNodeId]);

  const refreshFromTasks = useCallback(() => {
    if (!selectedMap?.anchorTaskId) return;
    const mapNodes = buildMindMapFromTasks(selectedMap.anchorTaskId, tasks);
    const preserved = selectedMap.nodes.filter(
      (n) => n.kind !== "task" || !n.taskId,
    );
    const merged = [...mapNodes, ...preserved];
    const updated: MindMapDocument = {
      ...selectedMap,
      nodes: merged,
      updatedAt: new Date().toISOString(),
    };
    upsertMap(updated);
    setNodes(toFlowNodes(merged, fullCallbacks, taskMap, selectedNodeId));
    setEdges(toFlowEdges(merged, mapDefaultEdgeLineType(updated)));
  }, [selectedMap, tasks, taskMap, upsertMap, setNodes, setEdges, fullCallbacks, selectedNodeId]);

  /* ─── Detail panel handlers ─── */

  const onUpdateNode = useCallback(
    (id: string, patch: Partial<MindMapNode>) => {
      const prev = getLatestMapNodes();
      const next = prev.map((n) => (n.id === id ? { ...n, ...patch } : n));
      const map = currentMapRef.current;
      if (map) {
        const updated = { ...map, nodes: next, updatedAt: new Date().toISOString() };
        currentMapRef.current = updated;
        upsertMap(updated);
      }
      if (patch.label != null) {
        setNodes((nds) =>
          nds.map((nd) =>
            nd.id === id ? { ...nd, data: { ...nd.data, label: patch.label } } : nd,
          ),
        );
      }
      if (patch.taskId !== undefined) {
        setNodes((nds) =>
          nds.map((nd) =>
            nd.id === id ? { ...nd, data: { ...nd.data, taskId: patch.taskId } } : nd,
          ),
        );
      }
      if (patch.kind != null) {
        setNodes((nds) =>
          nds.map((nd) =>
            nd.id === id ? { ...nd, data: { ...nd.data, kind: patch.kind } } : nd,
          ),
        );
      }
      if (
        "parentEdgeLineType" in patch ||
        "parentEdgeStroke" in patch ||
        "parentLinkSourceSide" in patch ||
        "parentLinkTargetSide" in patch
      ) {
        setEdges(toFlowEdges(next, mapDefaultEdgeLineType(currentMapRef.current)));
      }
    },
    [getLatestMapNodes, upsertMap, setNodes, setEdges],
  );

  const onDetailToggleComplete = useCallback(() => {
    if (!selectedNode?.taskId) return;
    const task = taskMap.get(selectedNode.taskId);
    if (!task) return;
    updateTask({ _id: task._id, completed: !task.completed });
  }, [selectedNode, taskMap, updateTask]);

  const onDetailToggleBoardVisibility = useCallback(() => {
    if (!selectedNode?.taskId) return;
    const newVisible = selectedNode.visibleOnBoard === false;
    onUpdateNode(selectedNode.id, { visibleOnBoard: newVisible });
    const task = taskMap.get(selectedNode.taskId);
    if (task) {
      updateTask({ _id: task._id, mindMapOnly: !newVisible });
    }
  }, [selectedNode, onUpdateNode, taskMap, updateTask]);

  const onDetailImportLinkedSubtasks = useCallback((): string => {
    if (!selectedMap || !selectedNode?.taskId) return "Select a linked task node first.";
    const next = importTaskSubtasksIntoMap(selectedNode.taskId, selectedMap, tasks);
    if (!next) return "Add/link the parent task node first.";
    if (next === selectedMap) return "All subtasks are already on this map.";
    upsertMap(next);
    setNodes(toFlowNodes(next.nodes, fullCallbacks, taskMap, selectedNode.id));
    setEdges(toFlowEdges(next.nodes, mapDefaultEdgeLineType(next)));
    return "Subtasks imported.";
  }, [selectedMap, selectedNode, tasks, upsertMap, setNodes, setEdges, fullCallbacks, taskMap]);

  const [renamingMapId, setRenamingMapId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 14px 8px" }}>
            <AppNavTasksPages active="mind-maps" />
          </div>
          <div style={{ padding: "8px 14px" }}>
            <button
              type="button"
              onClick={createMap}
              style={{
                width: "100%",
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={12} /> New mind map
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
            {maps.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  setSelectedMapId(m.id);
                  setSelectedNodeId(null);
                }}
                style={{
                  padding: "8px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  background:
                    m.id === selectedMapId
                      ? "rgba(75, 156, 245, 0.18)"
                      : "transparent",
                  color:
                    m.id === selectedMapId
                      ? "var(--accent-blue)"
                      : "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 4,
                  marginBottom: 2,
                }}
              >
                {renamingMapId === m.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) {
                        upsertMap({ ...m, title: renameValue.trim() });
                      }
                      setRenamingMapId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenamingMapId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      fontSize: 13,
                      padding: "2px 4px",
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--accent-blue)",
                      borderRadius: 4,
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingMapId(m.id);
                      setRenameValue(m.title);
                    }}
                  >
                    {m.title || "Untitled Map"}
                  </span>
                )}
                <button
                  type="button"
                  title="Delete map"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMap(m.id);
                  }}
                  style={{
                    flexShrink: 0,
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <Trash size={12} />
                </button>
              </div>
            ))}
            {!mapsLoading && maps.length === 0 && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  padding: "12px 8px",
                  textAlign: "center",
                }}
              >
                No mind maps yet
              </p>
            )}
          </div>
        </aside>
      )}

      {/* Canvas area */}
      <div style={{ flex: 1, position: "relative" }}>
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              zIndex: 10,
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
            title="Show sidebar"
          >
            &#9776;
          </button>
        )}

        {selectedMap ? (
          <>
            {/* Toolbar */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: sidebarOpen ? 10 : 52,
                zIndex: 10,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {sidebarOpen && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  title="Hide sidebar"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  &#8592;
                </button>
              )}

              <select
                value={addKind}
                onChange={(e) => setAddKind(e.target.value as MindMapNodeKind)}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              >
                {(Object.keys(KIND_LABELS) as MindMapNodeKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>

              <select
                title="Default connector for all links on this map (per-node overrides in details)"
                value={mapEdgeDefault}
                onChange={(e) =>
                  setMapDefaultEdgeLineType(e.target.value as MindMapEdgeLineType)
                }
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  maxWidth: 160,
                }}
              >
                {(Object.keys(EDGE_LINE_LABELS) as MindMapEdgeLineType[]).map((k) => (
                  <option key={k} value={k}>
                    Map: {EDGE_LINE_LABELS[k]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={addRootNode}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Plus size={12} /> Add node
              </button>

              {selectedMap.anchorTaskId && (
                <button
                  type="button"
                  onClick={refreshFromTasks}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-secondary)",
                    color: "var(--accent-blue)",
                    cursor: "pointer",
                  }}
                >
                  Refresh from tasks
                </button>
              )}
            </div>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={NODE_TYPES}
              defaultEdgeOptions={{
                type: mapEdgeDefault,
                style: { strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed },
              }}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              proOptions={{ hideAttribution: true }}
              style={{ width: "100%", height: "100%" }}
            >
              <Background gap={24} color="var(--border-subtle)" />
              <Controls
                showInteractive={false}
                style={{ borderRadius: 8 }}
              />
              <MiniMap
                nodeColor="var(--accent-blue)"
                maskColor="rgba(0,0,0,0.5)"
                style={{
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-primary)",
                }}
              />
            </ReactFlow>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              fontSize: 14,
            }}
          >
            {mapsLoading
              ? "Loading..."
              : "Select a mind map or create a new one"}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          mapDefaultEdgeLineType={mapEdgeDefault}
          allTasks={tasks}
          linkedTask={selectedLinkedTask}
          onClose={() => setSelectedNodeId(null)}
          onUpdateNode={onUpdateNode}
          onToggleComplete={onDetailToggleComplete}
          onToggleBoardVisibility={onDetailToggleBoardVisibility}
          onImportLinkedSubtasks={onDetailImportLinkedSubtasks}
        />
      )}
    </div>
  );
}
