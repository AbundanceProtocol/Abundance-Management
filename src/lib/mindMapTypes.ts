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
  /** Manual sibling order for Google Doc export (lower = earlier). Nodes without this fall
   *  back to canvas position (y, then x). Set automatically the first time a node is moved
   *  up or down within its sibling group via the node detail panel. */
  order?: number | null;
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
  /** When true, this node is omitted from Google Doc sync (children still export at this depth). */
  excludeFromGoogleDoc?: boolean;
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

/**
 * Sorts two sibling `MindMapNode`s for Google Doc export order.
 * Nodes with an explicit `order` value are sorted by that number (lower = earlier);
 * ties, and nodes without any explicit order, fall back to canvas position (y, then x).
 * This comparator is defined here (not in googleDocs.ts) so client code can import it
 * without pulling in the server-only googleapis dependency.
 */
export function compareMindMapSiblings(a: MindMapNode, b: MindMapNode): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  return ao - bo || a.y - b.y || a.x - b.x;
}

export interface MindMapsEnvironment {
  maps: MindMapDocument[];
}

export const DEFAULT_MIND_MAPS_ENVIRONMENT: MindMapsEnvironment = {
  maps: [],
};

/** Marker written into downloaded mind-map files so imports can validate the payload. */
export const MIND_MAP_FILE_FORMAT = "abundance-mind-map" as const;
export const MIND_MAP_FILE_VERSION = 1 as const;

export interface MindMapFilePayload {
  format: typeof MIND_MAP_FILE_FORMAT;
  version: typeof MIND_MAP_FILE_VERSION;
  exportedAt: string;
  map: MindMapDocument;
}

/**
 * Merges a local mind-map list with the server copy using last-write-wins per map (`updatedAt`).
 * Maps absent from `remote` are treated as deleted on the server and dropped from the result.
 */
export function mergeMapsLastWriteWins(
  local: MindMapDocument[],
  remote: MindMapDocument[],
): MindMapDocument[] {
  const localById = new Map(local.map((m) => [m.id, m]));
  return remote.map((remoteMap) => {
    const localMap = localById.get(remoteMap.id);
    if (!localMap || Date.parse(remoteMap.updatedAt) >= Date.parse(localMap.updatedAt)) {
      return remoteMap;
    }
    return localMap;
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isMindMapNode(v: unknown): v is MindMapNode {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    (v.parentId === null || typeof v.parentId === "string") &&
    typeof v.kind === "string" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.label === "string"
  );
}

function isMindMapDocument(v: unknown): v is MindMapDocument {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    Array.isArray(v.nodes) &&
    v.nodes.every(isMindMapNode) &&
    typeof v.updatedAt === "string"
  );
}

/** Builds the JSON string written when the user downloads a mind map. */
export function serializeMindMapFile(map: MindMapDocument): string {
  const payload: MindMapFilePayload = {
    format: MIND_MAP_FILE_FORMAT,
    version: MIND_MAP_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    map,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Parses a downloaded mind-map file. Accepts the versioned envelope or a bare `MindMapDocument`
 * for convenience. Throws with a short user-facing message on invalid input.
 */
export function parseMindMapFile(raw: string): MindMapDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (isRecord(parsed) && parsed.format === MIND_MAP_FILE_FORMAT) {
    if (!isMindMapDocument(parsed.map)) {
      throw new Error("That mind-map file is missing or has invalid map data.");
    }
    return parsed.map;
  }
  if (isMindMapDocument(parsed)) return parsed;
  throw new Error("That file is not a recognized mind-map export.");
}

/**
 * Clones a map with fresh document/node IDs (and remapped parent/root links) so an import
 * never collides with an existing board. External bindings (Google Doc, anchor task) are cleared
 * the same way as duplicate — visual structure, text, colors, and connectors are kept.
 */
export function cloneMindMapForImport(
  source: MindMapDocument,
  newId: () => string,
): MindMapDocument {
  const idMap = new Map<string, string>();
  const remappedNodes: MindMapNode[] = source.nodes.map((n) => {
    const id = newId();
    idMap.set(n.id, id);
    return { ...n, id };
  });
  const nodes = remappedNodes.map((n) => ({
    ...n,
    parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null,
  }));
  return {
    ...source,
    id: newId(),
    title: source.title?.trim() ? source.title : "Imported Map",
    nodes,
    rootNodeId: source.rootNodeId ? (idMap.get(source.rootNodeId) ?? null) : null,
    googleDocUrl: null,
    googleDocAutoSync: false,
    anchorTaskId: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Safe filename stem from a map title (no path separators or reserved characters). */
export function mindMapDownloadFilename(title: string): string {
  const stem =
    title
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "mind-map";
  return `${stem}.abundance-mindmap.json`;
}
