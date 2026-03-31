import type { MarkdownPageItem } from "./pagesTypes";
import {
  emptyPageDocument,
  PAGE_DOC_VERSION,
  parsePageBody,
  serializePageDocument,
} from "./pageDocument";
import { parseRecurringNotesEntriesFromPageBody } from "./recurringNotesPage";

function newPageId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

/** Plain text extracted from a v3 page body (for modal textarea). */
export function plainTextFromPageBody(body: string): string {
  const html = parsePageBody(body).html;
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? "").replace(/\u00a0/g, " ");
}

/** Serialize plain text as a simple pre-wrapped page document. */
export function pageBodyFromPlainText(text: string): string {
  const t = text ?? "";
  if (!t.trim()) return serializePageDocument(emptyPageDocument());
  return serializePageDocument({
    v: PAGE_DOC_VERSION,
    html: `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escapeHtml(
      t
    )}</pre>`,
  });
}

export function listRecurringDayPages(
  items: MarkdownPageItem[],
  hubId: string
): MarkdownPageItem[] {
  return items.filter(
    (p) =>
      p.parentId === hubId &&
      typeof p.recurringNoteDateYmd === "string" &&
      isValidYmd(p.recurringNoteDateYmd)
  );
}

export function findRecurringDayPageForDate(
  items: MarkdownPageItem[],
  hubId: string,
  ymd: string
): MarkdownPageItem | undefined {
  return items.find(
    (p) => p.parentId === hubId && p.recurringNoteDateYmd === ymd
  );
}

export function getOrCreateDayPage(
  items: MarkdownPageItem[],
  hub: MarkdownPageItem,
  taskId: string,
  ymd: string
): { items: MarkdownPageItem[]; dayPageId: string } {
  const existing = findRecurringDayPageForDate(items, hub.id, ymd);
  if (existing) return { items, dayPageId: existing.id };

  const siblings = items.filter((p) => p.parentId === hub.id);
  const maxOrder = siblings.reduce((m, p) => Math.max(m, p.order), -1);

  const dayPage: MarkdownPageItem = {
    id: newPageId(),
    title: ymd,
    body: serializePageDocument(emptyPageDocument()),
    linkedTaskId: taskId,
    parentId: hub.id,
    depth: hub.depth + 1,
    order: maxOrder + 1,
    recurringNoteDateYmd: ymd,
  };

  return { items: [...items, dayPage], dayPageId: dayPage.id };
}

/**
 * If the hub still uses legacy embedded multi-date body, split into child pages and clear the hub body.
 */
export function migrateLegacyHubBody(
  items: MarkdownPageItem[],
  hubId: string,
  taskId: string
): { items: MarkdownPageItem[]; migrated: boolean } {
  const hub = items.find((p) => p.id === hubId);
  if (!hub) return { items, migrated: false };

  const entries = parseRecurringNotesEntriesFromPageBody(hub.body);
  const keys = Object.keys(entries).filter((k) => isValidYmd(k));
  if (keys.length === 0) return { items, migrated: false };

  let next = [...items];
  let hubRef = next.find((p) => p.id === hubId)!;

  for (const ymd of keys.sort()) {
    const text = entries[ymd] ?? "";
    let dayPage = findRecurringDayPageForDate(next, hubId, ymd);
    if (!dayPage) {
      const created = getOrCreateDayPage(next, hubRef, taskId, ymd);
      next = created.items;
      hubRef = next.find((p) => p.id === hubId)!;
      dayPage = next.find((p) => p.id === created.dayPageId)!;
    }
    const existingPlain = plainTextFromPageBody(dayPage.body).trim();
    if (existingPlain === "" && text.trim()) {
      next = next.map((p) =>
        p.id === dayPage!.id ? { ...p, body: pageBodyFromPlainText(text) } : p
      );
    }
  }

  const emptyHub = serializePageDocument(emptyPageDocument());
  next = next.map((p) => (p.id === hubId ? { ...p, body: emptyHub } : p));

  return { items: next, migrated: true };
}

export function sortDayPagesByDate(
  pages: MarkdownPageItem[],
  order: "asc" | "desc"
): MarkdownPageItem[] {
  const ymd = (p: MarkdownPageItem) => p.recurringNoteDateYmd ?? "";
  return [...pages].sort((a, b) => {
    const c = ymd(a).localeCompare(ymd(b));
    return order === "asc" ? c : -c;
  });
}
