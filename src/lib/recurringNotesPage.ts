import { PAGE_DOC_VERSION, parsePageBody, serializePageDocument } from "./pageDocument";

export type RecurringNotesEntries = Record<string, string>;

const ROOT_ATTR = "data-recurring-notes-root";
const SCRIPT_ATTR = "data-recurring-notes-json";

const DATE_ATTR = "data-recurring-notes-date";
const NOTE_PRE_ATTR = "data-recurring-notes-text";

function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeForJsonScript(json: string): string {
  // Prevent closing script tags + avoid `<` parsing as HTML.
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/<\/script/gi, "<\\/script");
}

function normalizeEntries(raw: unknown): RecurringNotesEntries {
  if (!raw || typeof raw !== "object") return {};
  const out: RecurringNotesEntries = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidYmd(k)) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function parseRecurringNotesEntriesFromPageBody(
  pageBody: string
): RecurringNotesEntries {
  const doc = parsePageBody(pageBody);
  const html = doc.html;

  if (typeof document === "undefined") return {};

  const root = document.createElement("div");
  root.innerHTML = html;

  const script = root.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}]`);
  if (script) {
    const raw = script.textContent ?? "";
    try {
      const parsed = JSON.parse(raw);
      return normalizeEntries(parsed);
    } catch {
      // fall through to HTML parsing
    }
  }

  const entries: RecurringNotesEntries = {};
  const sections = root.querySelectorAll<HTMLElement>(`[${DATE_ATTR}]`);
  sections.forEach((el) => {
    const date = el.getAttribute(DATE_ATTR) ?? "";
    if (!isValidYmd(date)) return;
    const pre = el.querySelector<HTMLElement>(`pre[${NOTE_PRE_ATTR}]`);
    const text = pre?.textContent ?? "";
    entries[date] = text;
  });
  return entries;
}

function renderRecurringNotesHtml(entries: RecurringNotesEntries): string {
  const cleaned: RecurringNotesEntries = {};
  for (const [k, v] of Object.entries(entries)) {
    if (!isValidYmd(k)) continue;
    if (typeof v !== "string") continue;
    if (v.trim().length === 0) continue;
    cleaned[k] = v;
  }

  const dates = Object.keys(cleaned).sort((a, b) => (a > b ? -1 : 1));

  const json = JSON.stringify(cleaned);
  const safeJson = escapeForJsonScript(json);

  const sections =
    dates.length === 0
      ? `<p style="color: var(--text-muted); font-style: italic;">No notes yet.</p>`
      : dates
          .map((date, idx) => {
            const text = cleaned[date] ?? "";
            const divider =
              idx === 0
                ? ""
                : `<hr style="margin: 18px 0; border: 0; border-top: 1px solid var(--border-subtle); break-before: page; page-break-before: always;" />`;
            return `${divider}<div ${DATE_ATTR}="${date}">
  <h3>${escapeHtml(date)}</h3>
  <pre ${NOTE_PRE_ATTR} style="margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml(
    text
  )}</pre>
</div>`;
          })
          .join("");

  return `<div ${ROOT_ATTR}="1">
  <script type="application/json" ${SCRIPT_ATTR}>${safeJson}</script>
  <h2 style="margin-top: 0;">Recurring notes by date</h2>
  ${sections}
</div>`;
}

export function buildRecurringNotesPageBody(
  entries: RecurringNotesEntries
): string {
  const html = renderRecurringNotesHtml(entries);
  return serializePageDocument({ v: PAGE_DOC_VERSION, html });
}

