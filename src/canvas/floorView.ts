import type { Viewport } from "@xyflow/react";
import type { Rect } from "@/walls/gridGeometry";
import { getWallRenderRect } from "@/walls/gridGeometry/render";
import { overlayCorner } from "@/overlay/gesture";
import type { MapDocumentSnapshot } from "@/types/map";

/**
 * A floor seen for the first time is fitted no closer than this, so a lone
 * device shows its room rather than filling the screen (ADR 0029).
 */
export const FLOOR_FIT_MAX_ZOOM = 1;

const CORNERS = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
] as const;

/** Everything drawn on a floor: devices, walls and the calque. */
export function floorContentBounds(
  document: Pick<MapDocumentSnapshot, "devices" | "walls" | "overlay">,
): Rect | null {
  const rects: Array<Rect> = [
    ...document.devices.map((device) => ({
      ...device.position,
      ...device.size,
    })),
    ...document.walls.map(getWallRenderRect),
  ];
  const { overlay } = document;
  if (overlay) {
    const corners = CORNERS.map((corner) => overlayCorner(overlay, corner));
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    rects.push({
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    });
  }
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// Per tab, so a reload or a return to the floor finds the view, and another
// tab or a shared link starts from the fit.
const viewKey = (floorId: string) => `netplan:view:${floorId}`;

const isViewport = (value: unknown): value is Viewport =>
  typeof value === "object" &&
  value !== null &&
  ["x", "y", "zoom"].every((key) =>
    Number.isFinite((value as Record<string, unknown>)[key]),
  );

export function readFloorView(floorId: string): Viewport | null {
  try {
    const raw = sessionStorage.getItem(viewKey(floorId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isViewport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeFloorView(floorId: string, { x, y, zoom }: Viewport) {
  try {
    sessionStorage.setItem(viewKey(floorId), JSON.stringify({ x, y, zoom }));
  } catch {
    // A full or blocked storage only costs the restored view.
  }
}
