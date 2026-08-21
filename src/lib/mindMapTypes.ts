/**
 * `text` nodes have no title: they carry only `body` content and, in the Google Doc
 * outline, render as a plain paragraph continuing the previous text instead of a new
 * heading. Connecting a `text` node under a parent does not add a heading level — its
 * own children are exported as if they were attached directly to its parent.
 */
export type MindMapNodeKind = "idea" | "task" | "note" | "artifact" | "text";

/**
 * Connector path from parent → this node (React Flow built-in edge types, Miro-style presets in UI).
 */
export type MindMapEdgeLineType =
  | "smoothstep"
  | "step"
  | "straight"
  | "default"
  | "simplebezier";

/** Default connector shape for maps (React Flow `default` = Bézier). */
export const DEFAULT_MIND_MAP_EDGE_LINE_TYPE: MindMapEdgeLineType = "default";

/** Anchor on a node’s perimeter (center of that edge) for mind-map links. */
export type MindMapLinkSide = "top" | "right" | "bottom" | "left";

export interface MindMapNode {
  id: string;
  parentId: string | null;
  kind: MindMapNodeKind;
  x: number;
  y: number;
  label: string;
  /** Reference to an existing task (kind === "task"). */
  taskId?: string | null;
  /** Free-form content shown under the title inside the node bubble. */
  body?: string | null;
  /** Custom outline (border) color for this node's bubble; omit to use the kind default. */
  outlineColor?: string | null;
  /** URL string (kind === "artifact"). */
  url?: string | null;
  /** When true, a linked task is also shown on the Tasks board; when false it is mind-map-only. */
  visibleOnBoard?: boolean;
  /** Shape of the edge from parent to this node; omit to use the map default. */
  parentEdgeLineType?: MindMapEdgeLineType | null;
  /** Stroke style for parent→this edge; omit for solid. */
  parentEdgeStroke?: "solid" | "dashed" | null;
  /** Side of the parent node where the link starts (default `right`). */
  parentLinkSourceSide?: MindMapLinkSide | null;
  /** Side of this node where the link from the parent ends (default `left`). */
  parentLinkTargetSide?: MindMapLinkSide | null;
}

export interface MindMapDocument {
  id: string;
  title: string;
  /** The root node id (first created node). */
  rootNodeId: string | null;
  /** When derived from a task subtree, the anchor task id. */
  anchorTaskId?: string | null;
  /** Default connector for all parent→child edges unless a node sets `parentEdgeLineType`. */
  defaultEdgeLineType?: MindMapEdgeLineType | null;
  nodes: MindMapNode[];
  updatedAt: string;
  /** URL of a Google Doc (must be editable by the connected Google account) to sync this map's outline into. */
  googleDocUrl?: string | null;
  /** When true, automatically pushes this map's outline to `googleDocUrl` every 30s while changes are pending. */
  googleDocAutoSync?: boolean;
}

export interface MindMapsEnvironment {
  maps: MindMapDocument[];
}

export const DEFAULT_MIND_MAPS_ENVIRONMENT: MindMapsEnvironment = {
  maps: [],
};
