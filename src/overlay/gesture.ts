import {
  OVERLAY_MAX_SCALE,
  OVERLAY_MIN_SCALE,
  normalizeRotation,
} from "@/map-engine/overlay";
import type { OverlayPatch } from "@/map-engine/types";
import type { FloorOverlay, Position } from "@/types/map";

/** A corner of the calque, as the signs of its offset from the centre. */
export interface OverlayCorner {
  x: -1 | 1;
  y: -1 | 1;
}

/**
 * One pointer gesture on the calque, from the placement it started with and
 * the plan point where the pointer went down.
 */
export type OverlayGesture =
  | { kind: "move"; overlay: FloorOverlay; from: Position }
  | {
      kind: "resize";
      overlay: FloorOverlay;
      from: Position;
      corner: OverlayCorner;
    }
  | { kind: "rotate"; overlay: FloorOverlay; from: Position };

export const OVERLAY_ROTATION_SNAP = 15;

const clampScale = (scale: number) =>
  Math.min(OVERLAY_MAX_SCALE, Math.max(OVERLAY_MIN_SCALE, scale));

/** Rotates a vector clockwise on screen (y points down), like CSS rotate(). */
const rotate = (vector: Position, degrees: number): Position => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
};

const angleOf = (center: Position, point: Position): number =>
  (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;

/** The plan point of a corner of the calque. */
export function overlayCorner(
  overlay: FloorOverlay,
  corner: OverlayCorner,
): Position {
  const offset = rotate(
    {
      x: (corner.x * overlay.imageWidth * overlay.scale) / 2,
      y: (corner.y * overlay.imageHeight * overlay.scale) / 2,
    },
    overlay.rotation,
  );
  return { x: overlay.center.x + offset.x, y: overlay.center.y + offset.y };
}

function resizePatch(
  overlay: FloorOverlay,
  corner: OverlayCorner,
  pointer: Position,
): OverlayPatch {
  // The opposite corner stays put; the dragged one follows the pointer along
  // the diagonal, so the image keeps its proportions.
  const anchor = overlayCorner(overlay, {
    x: -corner.x as OverlayCorner["x"],
    y: -corner.y as OverlayCorner["y"],
  });
  const diagonal = Math.hypot(overlay.imageWidth, overlay.imageHeight);
  const direction = rotate(
    {
      x: (corner.x * overlay.imageWidth) / diagonal,
      y: (corner.y * overlay.imageHeight) / diagonal,
    },
    overlay.rotation,
  );
  const length =
    (pointer.x - anchor.x) * direction.x + (pointer.y - anchor.y) * direction.y;
  const scale = clampScale(length / diagonal);
  const half = (scale * diagonal) / 2;
  return {
    scale,
    center: {
      x: anchor.x + direction.x * half,
      y: anchor.y + direction.y * half,
    },
  };
}

/** The placement change a gesture makes once the pointer is at `pointer`. */
export function gesturePatch(
  gesture: OverlayGesture,
  pointer: Position,
  snap: boolean,
): OverlayPatch {
  const { overlay, from } = gesture;
  switch (gesture.kind) {
    case "move":
      return {
        center: {
          x: overlay.center.x + pointer.x - from.x,
          y: overlay.center.y + pointer.y - from.y,
        },
      };
    case "resize": {
      // Follow the grab offset, so the corner does not jump to the pointer.
      const start = overlayCorner(overlay, gesture.corner);
      return resizePatch(overlay, gesture.corner, {
        x: start.x + pointer.x - from.x,
        y: start.y + pointer.y - from.y,
      });
    }
    case "rotate": {
      const turned =
        overlay.rotation +
        angleOf(overlay.center, pointer) -
        angleOf(overlay.center, from);
      const rotation = snap
        ? Math.round(turned / OVERLAY_ROTATION_SNAP) * OVERLAY_ROTATION_SNAP
        : Math.round(turned * 10) / 10;
      return { rotation: normalizeRotation(rotation) };
    }
  }
}

/** Whether applying `patch` to `overlay` would change anything. */
export function patchChangesOverlay(
  overlay: FloorOverlay,
  patch: OverlayPatch,
): boolean {
  return (
    (patch.center !== undefined &&
      (patch.center.x !== overlay.center.x ||
        patch.center.y !== overlay.center.y)) ||
    (patch.scale !== undefined && patch.scale !== overlay.scale) ||
    (patch.rotation !== undefined && patch.rotation !== overlay.rotation) ||
    (patch.opacity !== undefined && patch.opacity !== overlay.opacity) ||
    (patch.locked !== undefined && patch.locked !== overlay.locked)
  );
}
