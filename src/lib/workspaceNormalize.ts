import type { TaskWorkspaceState, WorkspaceCanvasItem } from "./workspaceTypes";

export function normalizeWorkspaceItem(item: WorkspaceCanvasItem): WorkspaceCanvasItem {
  const title = typeof item.title === "string" ? item.title : "";
  const linkedTaskId =
    item.linkedTaskId === undefined || item.linkedTaskId === ""
      ? null
      : item.linkedTaskId;
  const linkRole =
    item.linkRole === "asset" || item.linkRole === "final"
      ? item.linkRole
      : null;

  switch (item.type) {
    case "image":
      return {
        ...item,
        title,
        linkedTaskId,
        linkRole,
      };
    case "video":
      return {
        ...item,
        title,
        linkedTaskId,
        linkRole,
      };
    case "markdown":
      return {
        ...item,
        title,
        linkedTaskId,
        linkRole,
        parentMarkdownId:
          item.parentMarkdownId === undefined || item.parentMarkdownId === ""
            ? null
            : item.parentMarkdownId,
      };
    default:
      return item;
  }
}

export function normalizeWorkspace(w: TaskWorkspaceState): TaskWorkspaceState {
  return {
    items: w.items.map(normalizeWorkspaceItem),
  };
}
