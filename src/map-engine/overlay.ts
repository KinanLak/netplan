import type { FloorOverlay } from "../types/map";
import type { OverlayPatch } from "./types";

// Shared by the client engine and the server planner (ADR 0024), so both
// accept and refuse the same calque placements. Relative imports: convex/
// bundles this file without the `@/` alias.

type OverlayPlacement = Pick<
  FloorOverlay,
  | "imageWidth"
  | "imageHeight"
  | "center"
  | "scale"
  | "rotation"
  | "opacity"
  | "locked"
>;

export const OVERLAY_MAX_IMAGE_SIDE = 16_384;
export const OVERLAY_MIN_SCALE = 0.001;
export const OVERLAY_MAX_SCALE = 1000;
export const OVERLAY_MIN_OPACITY = 0.05;
export const OVERLAY_MAX_COORDINATE = 1_000_000;

export type OverlayError =
  | "invalid-image-size"
  | "invalid-center"
  | "invalid-scale"
  | "invalid-rotation"
  | "invalid-opacity";

const isImageSide = (value: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= OVERLAY_MAX_IMAGE_SIDE;

const isCoordinate = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value) <= OVERLAY_MAX_COORDINATE;

export function overlayError(overlay: OverlayPlacement): OverlayError | null {
  if (!isImageSide(overlay.imageWidth) || !isImageSide(overlay.imageHeight)) {
    return "invalid-image-size";
  }
  if (!isCoordinate(overlay.center.x) || !isCoordinate(overlay.center.y)) {
    return "invalid-center";
  }
  if (
    !Number.isFinite(overlay.scale) ||
    overlay.scale < OVERLAY_MIN_SCALE ||
    overlay.scale > OVERLAY_MAX_SCALE
  ) {
    return "invalid-scale";
  }
  if (
    !Number.isFinite(overlay.rotation) ||
    overlay.rotation < 0 ||
    overlay.rotation >= 360
  ) {
    return "invalid-rotation";
  }
  if (
    !Number.isFinite(overlay.opacity) ||
    overlay.opacity < OVERLAY_MIN_OPACITY ||
    overlay.opacity > 1
  ) {
    return "invalid-opacity";
  }
  return null;
}

/** Field by field, so two clients' key order never makes a no-op a change. */
export function sameOverlay(
  left: OverlayPlacement & { floorId: string; fileId: string },
  right: OverlayPlacement & { floorId: string; fileId: string },
): boolean {
  return (
    left.floorId === right.floorId &&
    left.fileId === right.fileId &&
    left.imageWidth === right.imageWidth &&
    left.imageHeight === right.imageHeight &&
    left.center.x === right.center.x &&
    left.center.y === right.center.y &&
    left.scale === right.scale &&
    left.rotation === right.rotation &&
    left.opacity === right.opacity &&
    left.locked === right.locked
  );
}

/** Brings any angle in degrees into the stored range [0, 360). */
export function normalizeRotation(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 360 ? 0 : normalized;
}

export function applyOverlayPatch<T extends OverlayPlacement>(
  overlay: T,
  patch: OverlayPatch,
): T {
  return {
    ...overlay,
    center: patch.center ?? overlay.center,
    scale: patch.scale ?? overlay.scale,
    rotation: patch.rotation ?? overlay.rotation,
    opacity: patch.opacity ?? overlay.opacity,
    locked: patch.locked ?? overlay.locked,
  };
}

const movesOverlay = (patch: OverlayPatch): boolean =>
  patch.center !== undefined ||
  patch.scale !== undefined ||
  patch.rotation !== undefined;

/**
 * A locked calque keeps its placement: only a change that unlocks it in the
 * same step may move it. Opacity stays editable so it can be faded while
 * walls are drawn over it.
 */
export function isPatchBlockedByLock(
  overlay: Pick<FloorOverlay, "locked">,
  patch: OverlayPatch,
): boolean {
  return overlay.locked && patch.locked !== false && movesOverlay(patch);
}
