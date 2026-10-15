import { PLAN_UNITS_PER_METRE } from "@/lib/grid";
import { OVERLAY_MAX_SCALE, OVERLAY_MIN_SCALE } from "@/map-engine/overlay";
import type { OverlayPatch } from "@/map-engine/types";
import type { FloorOverlay, Position } from "@/types/map";
import { rotate } from "./gesture";

/**
 * Two points closer than this on the image make the scale too imprecise to
 * trust: a one-pixel click error would already be a 10 % error.
 */
export const OVERLAY_CALIBRATION_MIN_PIXELS = 10;

/** The pixel of the calque's image under a plan point. */
export function planToImage(overlay: FloorOverlay, point: Position): Position {
  const local = rotate(
    { x: point.x - overlay.center.x, y: point.y - overlay.center.y },
    -overlay.rotation,
  );
  return {
    x: local.x / overlay.scale + overlay.imageWidth / 2,
    y: local.y / overlay.scale + overlay.imageHeight / 2,
  };
}

/** The plan point under a pixel of the calque's image. */
export function imageToPlan(overlay: FloorOverlay, pixel: Position): Position {
  const offset = rotate(
    {
      x: (pixel.x - overlay.imageWidth / 2) * overlay.scale,
      y: (pixel.y - overlay.imageHeight / 2) * overlay.scale,
    },
    overlay.rotation,
  );
  return { x: overlay.center.x + offset.x, y: overlay.center.y + offset.y };
}

export function isInsideImage(overlay: FloorOverlay, pixel: Position): boolean {
  return (
    pixel.x >= 0 &&
    pixel.y >= 0 &&
    pixel.x <= overlay.imageWidth &&
    pixel.y <= overlay.imageHeight
  );
}

const pixelDistance = (a: Position, b: Position) =>
  Math.hypot(b.x - a.x, b.y - a.y);

export function arePointsTooClose(a: Position, b: Position): boolean {
  return pixelDistance(a, b) < OVERLAY_CALIBRATION_MIN_PIXELS;
}

/** How far apart two pixels of the image are on the plan, in metres. */
export function calibrationMetres(
  overlay: FloorOverlay,
  a: Position,
  b: Position,
): number {
  return (pixelDistance(a, b) * overlay.scale) / PLAN_UNITS_PER_METRE;
}

export type CalibrationResult =
  | { ok: true; patch: Required<Pick<OverlayPatch, "scale" | "center">> }
  | { ok: false; reason: "points-too-close" | "invalid-distance" };

/**
 * The placement that puts pixels `a` and `b` of the image `metres` apart on
 * the plan (ADR 0024). The image grows or shrinks about `a`, which stays on
 * the same plan point, so a calibration started on a known corner of the
 * building keeps that corner where it was.
 */
export function calibrationPatch(
  overlay: FloorOverlay,
  a: Position,
  b: Position,
  metres: number,
): CalibrationResult {
  if (arePointsTooClose(a, b)) {
    return { ok: false, reason: "points-too-close" };
  }
  const scale = (metres * PLAN_UNITS_PER_METRE) / pixelDistance(a, b);
  if (
    !Number.isFinite(scale) ||
    scale < OVERLAY_MIN_SCALE ||
    scale > OVERLAY_MAX_SCALE
  ) {
    return { ok: false, reason: "invalid-distance" };
  }
  const anchor = imageToPlan(overlay, a);
  const factor = scale / overlay.scale;
  return {
    ok: true,
    patch: {
      scale,
      center: {
        x: anchor.x + (overlay.center.x - anchor.x) * factor,
        y: anchor.y + (overlay.center.y - anchor.y) * factor,
      },
    },
  };
}
