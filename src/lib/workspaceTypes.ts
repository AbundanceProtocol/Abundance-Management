/** Items placed on a task workspace canvas (persisted on the anchor task). */

export type WorkspaceItemLinkRole = "asset" | "final";

type WorkspaceItemCommon = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** User-visible label in the frame header (not the raw type name). */
  title: string;
  /** Subtree task this frame supports; optional. */
  linkedTaskId?: string | null;
  /** Meaningful when `linkedTaskId` is set: supporting material vs deliverable. */
  linkRole?: WorkspaceItemLinkRole | null;
};

export type WorkspaceCanvasItem =
  | (WorkspaceItemCommon & {
      type: "image";
      url: string;
    })
  | (WorkspaceItemCommon & {
      type: "video";
      url: string;
    })
  | (WorkspaceItemCommon & {
      type: "markdown";
      body: string;
      /** Optional markdown parent for nested page trees. */
      parentMarkdownId?: string | null;
    });

export interface TaskWorkspaceState {
  items: WorkspaceCanvasItem[];
}

export const DEFAULT_WORKSPACE: TaskWorkspaceState = { items: [] };

export const DEFAULT_IMAGE_SIZE = { width: 320, height: 220 };
export const DEFAULT_VIDEO_SIZE = { width: 360, height: 204 };
export const DEFAULT_MARKDOWN_SIZE = { width: 320, height: 260 };
