import { MarkdownPageItem } from "./pagesTypes";

export interface PageReorderItem {
  id: string;
  parentId: string | null;
  depth: number;
  order: number;
}

export function isUnderPage(
  pages: MarkdownPageItem[],
  descendantId: string,
  ancestorId: string
): boolean {
  let current = pages.find((p) => p.id === descendantId);
  while (current) {
    if (!current.parentId) return false;
    if (current.parentId === ancestorId) return true;
    current = pages.find((p) => p.id === current?.parentId);
  }
  return false;
}

function collectDescendants(rootId: string, pages: MarkdownPageItem[]): MarkdownPageItem[] {
  const out: MarkdownPageItem[] = [];
  function walk(parentId: string) {
    const children = pages
      .filter((p) => p.parentId === parentId)
      .sort((a, b) => a.order - b.order);
    for (const c of children) {
      out.push(c);
      walk(c.id);
    }
  }
  walk(rootId);
  return out;
}

function mergeUpdatesById(updates: PageReorderItem[]): PageReorderItem[] {
  const map = new Map<string, PageReorderItem>();
  for (const u of updates) map.set(u.id, u);
  return Array.from(map.values());
}

export function computePageNestMove(
  pages: MarkdownPageItem[],
  activePage: MarkdownPageItem,
  overPage: MarkdownPageItem
): PageReorderItem[] | null {
  if (activePage.id === overPage.id) return null;
  if (isUnderPage(pages, overPage.id, activePage.id)) return null;

  const newParentId = overPage.id;
  const newDepthActive = overPage.depth + 1;
  const delta = newDepthActive - activePage.depth;
  const descendants = collectDescendants(activePage.id, pages);

  const updates: PageReorderItem[] = [];
  const oldSiblings = pages
    .filter((p) => p.parentId === activePage.parentId && p.id !== activePage.id)
    .sort((a, b) => a.order - b.order);
  oldSiblings.forEach((p, i) => {
    updates.push({ id: p.id, parentId: p.parentId, depth: p.depth, order: i });
  });

  const newSiblings = pages
    .filter((p) => p.parentId === newParentId && p.id !== activePage.id)
    .sort((a, b) => a.order - b.order);
  updates.push({
    id: activePage.id,
    parentId: newParentId,
    depth: newDepthActive,
    order: newSiblings.length,
  });
  for (const d of descendants) {
    updates.push({ id: d.id, parentId: d.parentId, depth: d.depth + delta, order: d.order });
  }
  return mergeUpdatesById(updates);
}

export function computePageSiblingMoveAfter(
  pages: MarkdownPageItem[],
  activePage: MarkdownPageItem,
  afterPage: MarkdownPageItem
): PageReorderItem[] | null {
  if (activePage.id === afterPage.id) return null;
  if (isUnderPage(pages, afterPage.id, activePage.id)) return null;

  const targetParentId = afterPage.parentId;
  const targetDepth = afterPage.depth;
  const delta = targetDepth - activePage.depth;
  const descendants = collectDescendants(activePage.id, pages);
  const updates: PageReorderItem[] = [];

  if (activePage.parentId !== targetParentId) {
    const oldSiblings = pages
      .filter((p) => p.parentId === activePage.parentId && p.id !== activePage.id)
      .sort((a, b) => a.order - b.order);
    oldSiblings.forEach((p, i) => {
      updates.push({ id: p.id, parentId: p.parentId, depth: p.depth, order: i });
    });
  }

  const siblings = pages
    .filter((p) => p.parentId === targetParentId && p.id !== activePage.id)
    .sort((a, b) => a.order - b.order);
  const afterIndex = siblings.findIndex((p) => p.id === afterPage.id);
  const insertIndex = afterIndex === -1 ? siblings.length : afterIndex + 1;
  const next = [...siblings];
  next.splice(insertIndex, 0, {
    ...activePage,
    parentId: targetParentId,
    depth: targetDepth,
  });
  next.forEach((p, i) => {
    updates.push({ id: p.id, parentId: targetParentId, depth: targetDepth, order: i });
  });
  for (const d of descendants) {
    updates.push({ id: d.id, parentId: d.parentId, depth: d.depth + delta, order: d.order });
  }
  return mergeUpdatesById(updates);
}

export function computePageSiblingMove(
  pages: MarkdownPageItem[],
  activePage: MarkdownPageItem,
  overPage: MarkdownPageItem
): PageReorderItem[] | null {
  if (activePage.id === overPage.id) return null;
  if (isUnderPage(pages, overPage.id, activePage.id)) return null;

  const targetParentId = overPage.parentId;
  const targetDepth = overPage.depth;
  const delta = targetDepth - activePage.depth;
  const descendants = collectDescendants(activePage.id, pages);
  const updates: PageReorderItem[] = [];

  if (activePage.parentId !== targetParentId) {
    const oldSiblings = pages
      .filter((p) => p.parentId === activePage.parentId && p.id !== activePage.id)
      .sort((a, b) => a.order - b.order);
    oldSiblings.forEach((p, i) => {
      updates.push({ id: p.id, parentId: p.parentId, depth: p.depth, order: i });
    });
  }

  const siblings = pages
    .filter((p) => p.parentId === targetParentId && p.id !== activePage.id)
    .sort((a, b) => a.order - b.order);
  const overIndex = siblings.findIndex((p) => p.id === overPage.id);
  const insertIndex = overIndex === -1 ? siblings.length : overIndex;
  const next = [...siblings];
  next.splice(insertIndex, 0, {
    ...activePage,
    parentId: targetParentId,
    depth: targetDepth,
  });
  next.forEach((p, i) => {
    updates.push({ id: p.id, parentId: targetParentId, depth: targetDepth, order: i });
  });
  for (const d of descendants) {
    updates.push({ id: d.id, parentId: d.parentId, depth: d.depth + delta, order: d.order });
  }
  return mergeUpdatesById(updates);
}
