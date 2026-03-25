import { marked } from "marked";

export const PAGE_DOC_VERSION = 3 as const;

/** Single HTML document; task links are inline spans with class `page-task-mark`. */
export interface PageDocumentV3 {
  v: typeof PAGE_DOC_VERSION;
  html: string;
}

/** @deprecated Legacy block storage — migrated to v3 on read. */
export interface PageBlock {
  id: string;
  html: string;
  linkedTaskId?: string | null;
}

export interface PageDocumentV2 {
  v: 2;
  blocks: PageBlock[];
}

export function newLinkId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `L-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @deprecated use newLinkId */
export const newBlockId = newLinkId;

export function emptyPageDocument(): PageDocumentV3 {
  return { v: PAGE_DOC_VERSION, html: "<p><br></p>" };
}

export function serializePageDocument(doc: PageDocumentV3): string {
  return JSON.stringify(doc);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTaskLinksFromElement(el: Element): { html: string; linkedTaskId: string | null } {
  const clone = el.cloneNode(true) as Element;
  const taskLink = clone.querySelector('a[href^="task://"]');
  let linkedTaskId: string | null = null;
  if (taskLink) {
    const href = taskLink.getAttribute("href") || "";
    const m = /^task:\/\/(.+)$/.exec(href);
    if (m) linkedTaskId = m[1];
    const parent = taskLink.parentNode;
    if (parent) {
      while (taskLink.firstChild) parent.insertBefore(taskLink.firstChild, taskLink);
      parent.removeChild(taskLink);
    }
  }
  return { html: clone.outerHTML, linkedTaskId };
}

function migrateLegacyMarkdownToHtml(md: string): string {
  const html = String(
    marked.parse(md || "", {
      gfm: true,
      breaks: true,
      async: false,
    })
  );
  return `<div class="page-legacy-import">${html}</div>`;
}

function migrateLegacyMarkdownClient(md: string): PageDocumentV3 {
  if (typeof document === "undefined") {
    return { v: PAGE_DOC_VERSION, html: migrateLegacyMarkdownToHtml(md) };
  }

  const html = String(
    marked.parse(md || "", {
      gfm: true,
      breaks: true,
      async: false,
    })
  );
  const container = document.createElement("div");
  container.innerHTML = html.trim();

  if (!container.children.length) {
    const text = (container.textContent || md || "").trim();
    return { v: PAGE_DOC_VERSION, html: `<p>${escapeHtml(text)}</p>` };
  }

  const parts: string[] = [];
  const blockTags = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BLOCKQUOTE",
    "UL",
    "OL",
    "PRE",
    "DIV",
    "HR",
  ]);

  for (const child of Array.from(container.children)) {
    const el = child as Element;
    if (!blockTags.has(el.tagName)) continue;
    const { html: blockHtml } = stripTaskLinksFromElement(el);
    parts.push(blockHtml);
  }

  if (parts.length === 0) {
    return { v: PAGE_DOC_VERSION, html: migrateLegacyMarkdownToHtml(md) };
  }

  return { v: PAGE_DOC_VERSION, html: parts.join("") };
}

/** Class on spans that wrap text linked to a task (inline highlights). */
export const PAGE_TASK_MARK_CLASS = "page-task-mark";

function v2ToV3(doc: PageDocumentV2): PageDocumentV3 {
  if (typeof document === "undefined") {
    const html = doc.blocks.map((b) => b.html || "").join("");
    return { v: PAGE_DOC_VERSION, html: html.trim() ? html : "<p><br></p>" };
  }

  const parts: string[] = [];
  for (const b of doc.blocks) {
    let h = b.html || "";
    if (b.linkedTaskId && h.trim()) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = h.trim();
      const first = wrapper.firstElementChild;
      if (first) {
        const id = newLinkId();
        const span = document.createElement("span");
        span.className = PAGE_TASK_MARK_CLASS;
        span.dataset.linkId = id;
        span.dataset.taskId = b.linkedTaskId;
        span.title = "Linked task";
        span.style.backgroundColor = "rgba(244, 114, 182, 0.22)";
        span.style.borderRadius = "2px";
        span.style.boxDecorationBreak = "clone";
        while (first.firstChild) span.appendChild(first.firstChild);
        first.appendChild(span);
        parts.push(wrapper.innerHTML);
        continue;
      }
    }
    parts.push(h);
  }
  const html = parts.join("").trim();
  return { v: PAGE_DOC_VERSION, html: html ? html : "<p><br></p>" };
}

export function parsePageBody(body: string): PageDocumentV3 {
  const trimmed = (body || "").trim();
  if (!trimmed) return emptyPageDocument();

  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as {
        v?: number;
        html?: string;
        blocks?: PageBlock[];
      };
      if (j && j.v === PAGE_DOC_VERSION && typeof j.html === "string") {
        return {
          v: PAGE_DOC_VERSION,
          html: j.html.trim() ? j.html : "<p><br></p>",
        };
      }
      if (j && j.v === 2 && Array.isArray(j.blocks) && j.blocks.length > 0) {
        return v2ToV3({
          v: 2,
          blocks: j.blocks.map((b) => ({
            id: typeof b.id === "string" && b.id ? b.id : newLinkId(),
            html: typeof b.html === "string" && b.html.trim() ? b.html : "<p></p>",
            linkedTaskId: b.linkedTaskId ?? null,
          })),
        });
      }
    } catch {
      /* fall through */
    }
  }

  return migrateLegacyMarkdownClient(trimmed);
}

export function collectLinkedTaskIdsFromDoc(doc: PageDocumentV3): string[] {
  return collectLinkedTaskIdsFromHtml(doc.html);
}

export function collectLinkedTaskIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  const re = /data-task-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

export type TaskAnchorSummary = {
  linkId: string;
  taskId: string;
  snippet: string;
};

export function extractTaskAnchorSummaries(html: string): TaskAnchorSummary[] {
  if (typeof document === "undefined") {
    const out: TaskAnchorSummary[] = [];
    const re =
      /<span[^>]*class="[^"]*page-task-mark[^"]*"[^>]*data-link-id="([^"]+)"[^>]*data-task-id="([^"]+)"[^>]*>([\s\S]*?)<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const snippet = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      out.push({ linkId: m[1], taskId: m[2], snippet });
    }
    return out;
  }

  const d = document.createElement("div");
  d.innerHTML = html;
  const marks = d.querySelectorAll<HTMLElement>(
    `span.${PAGE_TASK_MARK_CLASS}[data-link-id][data-task-id]`
  );
  return [...marks].map((el) => ({
    linkId: el.dataset.linkId || "",
    taskId: el.dataset.taskId || "",
    snippet: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
  }));
}

export function htmlToPlainSnippet(html: string, max = 120): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }
  const d = document.createElement("div");
  d.innerHTML = html;
  const t = (d.textContent || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
