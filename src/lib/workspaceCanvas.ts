/** World size in px; items use coordinates in this space. */
export const WORLD_CANVAS_SIZE = 48_000;

/** Matches the dot grid on the workspace canvas (`backgroundSize`). */
export const WORKSPACE_GRID_PX = 20;

export function snapToGrid(
  value: number,
  grid: number = WORKSPACE_GRID_PX
): number {
  return Math.round(value / grid) * grid;
}

export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 1.12;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function clientToWorld(
  clientX: number,
  clientY: number,
  viewportEl: HTMLElement,
  pan: { x: number; y: number },
  zoom: number
): { x: number; y: number } {
  const r = viewportEl.getBoundingClientRect();
  const vx = clientX - r.left;
  const vy = clientY - r.top;
  return {
    x: (vx - pan.x) / zoom,
    y: (vy - pan.y) / zoom,
  };
}

/** World coordinates at the center of the visible viewport (for placing new items in view). */
export function viewportCenterWorld(
  viewportEl: HTMLElement,
  pan: { x: number; y: number },
  zoom: number
): { x: number; y: number } {
  const r = viewportEl.getBoundingClientRect();
  return clientToWorld(
    r.left + r.width / 2,
    r.top + r.height / 2,
    viewportEl,
    pan,
    zoom
  );
}

/** Adjust pan so zoom is centered on viewport point (e.g. cursor). */
export function zoomAtViewportPoint(
  clientX: number,
  clientY: number,
  viewportEl: HTMLElement,
  pan: { x: number; y: number },
  prevZoom: number,
  nextZoom: number
): { x: number; y: number } {
  const r = viewportEl.getBoundingClientRect();
  const vx = clientX - r.left;
  const vy = clientY - r.top;
  const worldX = (vx - pan.x) / prevZoom;
  const worldY = (vy - pan.y) / prevZoom;
  return {
    x: vx - worldX * nextZoom,
    y: vy - worldY * nextZoom,
  };
}
