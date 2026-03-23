const LINK_LABEL_CHARS = 18;

export function normalizeTaskHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Strip http(s):// and show hostname + path + query (truncated). */
export function formatTaskUrlLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  let display = t;
  try {
    const u = new URL(normalizeTaskHref(t));
    const path = u.pathname === "/" ? "" : u.pathname;
    display = `${u.hostname}${path}${u.search}`;
  } catch {
    try {
      const u = new URL(`https://${t}`);
      const path = u.pathname === "/" ? "" : u.pathname;
      display = `${u.hostname}${path}${u.search}`;
    } catch {
      display = t;
    }
  }
  if (display.length <= LINK_LABEL_CHARS) return display;
  return `${display.slice(0, LINK_LABEL_CHARS)}…`;
}

/**
 * Merge `urls` and legacy `url` from stored documents.
 * If `urls` is an array (including empty), it wins and legacy `url` is ignored.
 */
export function normalizeUrlsFromDoc(doc: { urls?: unknown; url?: unknown }): string[] {
  if (Array.isArray(doc.urls)) {
    const out: string[] = [];
    for (const u of doc.urls) {
      if (typeof u === "string" && u.trim()) out.push(u.trim());
    }
    return out;
  }
  if (typeof doc.url === "string" && doc.url.trim()) {
    return [doc.url.trim()];
  }
  return [];
}
