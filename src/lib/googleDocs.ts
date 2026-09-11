/**
 * Server-side Google Docs integration: renders a mind map's node tree as an outline
 * (headings + body paragraphs) and writes it into a reserved region of a Google Doc.
 * All functions run only in API routes — never imported client-side.
 */

import { google, docs_v1 } from "googleapis";
import type { AppDataStore, GoogleOAuthToken } from "@/lib/dataStore/types";
import type { MindMapDocument, MindMapNode } from "@/lib/mindMapTypes";
import { compareMindMapSiblings } from "@/lib/mindMapTypes";
import { getAuthedClient } from "@/lib/googleCalendar";

/** Everything between these two sentinel paragraphs is replaced on every push; content outside is left alone. */
const MARK_START = "[[MINDMAP:START]]";
const MARK_END = "[[MINDMAP:END]]";

// ─── Doc URL parsing ──────────────────────────────────────────────────────────

/** Extracts the document ID from a Google Docs URL, or accepts a bare ID. */
export function extractGoogleDocId(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Parses the Docs UI `?tab=` query value into a candidate API tab id.
 * URLs look like `?tab=t.0` (first tab) or `?tab=t.t8fq6dk6x7kr` (specific tab).
 * Returns `null` when the URL targets the first tab / has no tab param.
 */
export function extractGoogleDocTabHint(input: string): string | null {
  const match = input.trim().match(/[?&#]tab=([^&#]+)/i);
  if (!match) return null;
  let raw = match[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  // UI wraps ids as `t.<id>`; `t.0` means the first tab.
  const withoutPrefix = raw.startsWith("t.") ? raw.slice(2) : raw;
  if (!withoutPrefix || withoutPrefix === "0") return null;
  return withoutPrefix;
}

/** Depth-first flat list of tabs (including nested child tabs), in UI order. */
function flattenTabs(tabs: docs_v1.Schema$Tab[] | undefined): docs_v1.Schema$Tab[] {
  const out: docs_v1.Schema$Tab[] = [];
  for (const tab of tabs ?? []) {
    out.push(tab);
    if (tab.childTabs?.length) out.push(...flattenTabs(tab.childTabs));
  }
  return out;
}

/**
 * Resolves which tab to write into. Prefers an explicit URL tab hint; otherwise the first tab.
 * Throws if the URL names a tab that isn't in the document.
 */
function resolveTargetTab(
  doc: docs_v1.Schema$Document,
  tabHint: string | null
): { tabId: string; body: docs_v1.Schema$Body } {
  const allTabs = flattenTabs(doc.tabs);
  if (allTabs.length === 0) {
    // Legacy / single-tab responses without `includeTabsContent` — fall back to document.body.
    if (doc.body) return { tabId: "", body: doc.body };
    throw new Error("That Google Doc has no readable tab content.");
  }

  let tab: docs_v1.Schema$Tab | undefined;
  if (tabHint) {
    tab = allTabs.find((t) => {
      const id = t.tabProperties?.tabId;
      if (!id) return false;
      return id === tabHint || id === `t.${tabHint}` || `t.${id}` === tabHint;
    });
    if (!tab) {
      throw new Error(
        `Could not find tab "${tabHint}" in that Google Doc. Open the tab you want and paste its full URL (including ?tab=…).`
      );
    }
  } else {
    tab = allTabs[0];
  }

  const tabId = tab.tabProperties?.tabId;
  const body = tab.documentTab?.body;
  if (!tabId || !body) {
    throw new Error("That Google Doc tab has no editable body.");
  }
  return { tabId, body };
}

// ─── Mind map → outline text ──────────────────────────────────────────────────

type StyleRange =
  | { type: "heading"; level: number; start: number; end: number }
  | { type: "body"; start: number; end: number }
  | { type: "link"; url: string; start: number; end: number };

type Line =
  | { kind: "heading"; level: number; text: string }
  | { kind: "body"; text: string }
  | { kind: "link"; text: string; url: string };

function buildLines(map: MindMapDocument): Line[] {
  const childrenByParent = new Map<string | null, MindMapNode[]>();
  for (const n of map.nodes) {
    const list = childrenByParent.get(n.parentId) ?? [];
    list.push(n);
    childrenByParent.set(n.parentId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(compareMindMapSiblings);
  }

  const lines: Line[] = [];
  const visited = new Set<string>();

  function visit(node: MindMapNode, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Excluded nodes contribute nothing themselves; children still export at this depth
    // (same promotion rule as `text` nodes that don't consume a heading level).
    if (node.excludeFromGoogleDoc) {
      for (const child of childrenByParent.get(node.id) ?? []) {
        visit(child, depth);
      }
      return;
    }

    // `text` nodes have no title: they contribute a plain paragraph (continuing the
    // previous text) instead of a heading, and don't consume a heading level — their
    // children are exported at the same depth as if attached directly to the parent.
    if (node.kind === "text") {
      const text = (node.body?.trim() || node.label?.trim() || "");
      if (text) {
        // Blank line above so this reads as a new paragraph rather than running on
        // from the previous line, without introducing a heading of its own.
        if (lines.length > 0) lines.push({ kind: "body", text: "" });
        for (const bodyLine of text.split(/\r?\n/)) {
          lines.push({ kind: "body", text: bodyLine });
        }
      }
    } else {
      const level = Math.min(depth + 1, 6);
      lines.push({ kind: "heading", level, text: node.label?.trim() || "(untitled)" });

      const body = node.body?.trim();
      if (body) {
        for (const bodyLine of body.split(/\r?\n/)) {
          lines.push({ kind: "body", text: bodyLine });
        }
      }
    }

    if (node.kind === "artifact" && node.url?.trim()) {
      const url = node.url.trim();
      lines.push({ kind: "link", text: url, url });
    }

    const childDepth = node.kind === "text" ? depth : depth + 1;
    for (const child of childrenByParent.get(node.id) ?? []) {
      visit(child, childDepth);
    }
  }

  const roots = [...(childrenByParent.get(null) ?? [])].sort(compareMindMapSiblings);
  for (const root of roots) visit(root, 0);

  // Nodes whose parentId doesn't resolve to anything on the map would otherwise be dropped silently.
  for (const n of map.nodes) {
    if (!visited.has(n.id)) visit(n, 0);
  }

  return lines;
}

function buildMindMapContent(map: MindMapDocument): { text: string; styleRanges: StyleRange[] } {
  const lines = buildLines(map);
  if (lines.length === 0) {
    return { text: "(This mind map has no nodes yet.)", styleRanges: [] };
  }

  let cursor = 0;
  const parts: string[] = [];
  const styleRanges: StyleRange[] = [];

  for (const line of lines) {
    const start = cursor;
    const end = start + line.text.length;
    if (line.kind === "heading") styleRanges.push({ type: "heading", level: line.level, start, end });
    else if (line.kind === "body") styleRanges.push({ type: "body", start, end });
    else styleRanges.push({ type: "link", url: line.url, start, end });
    parts.push(line.text);
    cursor = end + 1; // account for the joining "\n"
  }

  return { text: parts.join("\n"), styleRanges };
}

// ─── Locating the reserved region inside the Doc ──────────────────────────────

function paragraphText(paragraph: docs_v1.Schema$Paragraph): string {
  return (paragraph.elements ?? []).map((el) => el.textRun?.content ?? "").join("").trim();
}

/** Finds the sentinel paragraphs in a tab body, if present. `insertAt` is right after the start marker's line; `deleteEnd` is the start of the end marker's line. */
function locateMarkers(body: docs_v1.Schema$Body): { insertAt: number; deleteEnd: number } | null {
  const content = body.content ?? [];
  let insertAt: number | null = null;
  let deleteEnd: number | null = null;

  for (const el of content) {
    if (!el.paragraph) continue;
    const text = paragraphText(el.paragraph);
    if (text === MARK_START && el.endIndex != null) insertAt = el.endIndex;
    if (text === MARK_END && el.startIndex != null) deleteEnd = el.startIndex;
  }

  if (insertAt == null || deleteEnd == null || deleteEnd < insertAt) return null;
  return { insertAt, deleteEnd };
}

/** Builds a Docs API location/range tab field — omitted when empty so single-tab legacy docs still work. */
function tabFields(tabId: string): { tabId?: string } {
  return tabId ? { tabId } : {};
}

// ─── Push mind map → Google Doc ───────────────────────────────────────────────

export async function pushMindMapToGoogleDoc(
  map: MindMapDocument,
  storedToken: GoogleOAuthToken,
  store: AppDataStore
): Promise<{ documentId: string; documentTitle: string }> {
  const url = map.googleDocUrl?.trim();
  if (!url) throw new Error("This mind map has no Google Doc URL set.");

  const documentId = extractGoogleDocId(url);
  if (!documentId) throw new Error("Could not find a document ID in that Google Doc URL.");
  const tabHint = extractGoogleDocTabHint(url);

  const auth = await getAuthedClient(storedToken, store);
  const docs = google.docs({ version: "v1", auth });

  // Must request tab contents; otherwise only the first tab is readable and writes default there.
  const current = await docs.documents.get({ documentId, includeTabsContent: true });
  const { tabId, body } = resolveTargetTab(current.data, tabHint);
  const tab = tabFields(tabId);
  const { text, styleRanges } = buildMindMapContent(map);

  const marker = locateMarkers(body);
  const requests: docs_v1.Schema$Request[] = [];
  let insertAt: number;
  let insertedText: string;
  let offset: number;

  if (marker) {
    if (marker.deleteEnd > marker.insertAt) {
      requests.push({
        deleteContentRange: {
          range: { startIndex: marker.insertAt, endIndex: marker.deleteEnd, ...tab },
        },
      });
    }
    insertAt = marker.insertAt;
    insertedText = `${text}\n`;
    offset = 0;
  } else {
    // No reserved region yet — append one at the end of this tab.
    const content = body.content ?? [];
    const last = content[content.length - 1];
    const endOfDoc = Math.max((last?.endIndex ?? 1) - 1, 1);
    const prefix = `\n${MARK_START}\n`;
    insertAt = endOfDoc;
    insertedText = `${prefix}${text}\n${MARK_END}\n`;
    offset = prefix.length;
  }

  requests.push({
    insertText: { location: { index: insertAt, ...tab }, text: insertedText },
  });

  for (const range of styleRanges) {
    const absStart = insertAt + offset + range.start;
    const absEnd = insertAt + offset + range.end;
    if (range.type === "heading") {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: absStart, endIndex: absEnd + 1, ...tab },
          paragraphStyle: { namedStyleType: `HEADING_${range.level}` },
          fields: "namedStyleType",
        },
      });
    } else if (range.type === "body") {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: absStart, endIndex: absEnd + 1, ...tab },
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
          fields: "namedStyleType",
        },
      });
    } else {
      requests.push({
        updateTextStyle: {
          range: { startIndex: absStart, endIndex: absEnd, ...tab },
          textStyle: {
            link: { url: range.url },
            foregroundColor: { color: { rgbColor: { red: 0.06, green: 0.38, blue: 0.86 } } },
            underline: true,
          },
          fields: "link,foregroundColor,underline",
        },
      });
    }
  }

  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });

  return { documentId, documentTitle: current.data.title ?? "Google Doc" };
}
