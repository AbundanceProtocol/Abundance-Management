/** Normalize Dropbox shared links so images/videos load directly in the browser. */
export function normalizeDropboxDirectUrl(url: string): string {
  const t = url.trim();
  if (!/dropbox\.com/i.test(t)) return t;
  try {
    const p = new URL(t);
    if (p.searchParams.get("dl") !== "1") {
      p.searchParams.set("dl", "1");
    }
    return p.toString();
  } catch {
    return t.includes("dl=0") ? t.replace("dl=0", "dl=1") : `${t}${t.includes("?") ? "&" : "?"}dl=1`;
  }
}

const VIDEO_RE = /\.(mp4|webm|ogg|mov|m4v|mkv)(\?|#|$)/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i;

export type MediaKind = "image" | "video";

/** Guess media type from URL path (Dropbox short links may lack an extension). */
export function classifyMediaUrl(url: string): MediaKind {
  const path = url.split("?")[0] ?? url;
  if (VIDEO_RE.test(path)) return "video";
  if (IMAGE_RE.test(path)) return "image";
  return "image";
}

export function extractHttpUrl(text: string): string | null {
  const t = text.trim();
  const m = t.match(/https?:\/\/[^\s]+/i);
  return m ? m[0].replace(/[),.;]+$/, "") : null;
}
