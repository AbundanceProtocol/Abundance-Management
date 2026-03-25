export interface MarkdownPageItem {
  id: string;
  title: string;
  body: string;
  linkedTaskId?: string | null;
  parentId: string | null;
  depth: number;
  order: number;
}

export interface PagesEnvironment {
  items: MarkdownPageItem[];
}

export const DEFAULT_PAGES_ENVIRONMENT: PagesEnvironment = {
  items: [],
};
