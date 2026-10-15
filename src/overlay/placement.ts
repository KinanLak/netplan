import { OVERLAY_MAX_SCALE, OVERLAY_MIN_SCALE } from "@/map-engine/overlay";
import type {
  FloorId,
  FloorOverlay,
  OverlayFileId,
  Position,
} from "@/types/map";

export interface ImageSize {
  width: number;
  height: number;
}

/** The part of the plan on screen, in plan units. */
export interface PlanRect extends Position {
  width: number;
  height: number;
}

export interface UploadedOverlayFile extends ImageSize {
  fileId: OverlayFileId;
}

const DEFAULT_OVERLAY_OPACITY = 0.6;
const DEFAULT_VIEW_FILL = 0.8;

const clampScale = (scale: number) =>
  Math.min(OVERLAY_MAX_SCALE, Math.max(OVERLAY_MIN_SCALE, scale));

/** A new calque fills most of the view, centred, until it is calibrated. */
export function initialOverlay(
  floorId: FloorId,
  file: UploadedOverlayFile,
  view: PlanRect,
): FloorOverlay {
  const scale = clampScale(
    DEFAULT_VIEW_FILL *
      Math.min(view.width / file.width, view.height / file.height),
  );
  return {
    floorId,
    fileId: file.fileId,
    imageWidth: file.width,
    imageHeight: file.height,
    center: { x: view.x + view.width / 2, y: view.y + view.height / 2 },
    scale,
    rotation: 0,
    opacity: DEFAULT_OVERLAY_OPACITY,
    locked: false,
  };
}

/**
 * A replacement keeps the old calque's centre, angle, opacity and width on
 * the plan, so a new version of the same drawing lands roughly in place.
 */
export function replacedOverlay(
  current: FloorOverlay,
  file: UploadedOverlayFile,
): FloorOverlay {
  return {
    ...current,
    fileId: file.fileId,
    imageWidth: file.width,
    imageHeight: file.height,
    scale: clampScale((current.scale * current.imageWidth) / file.width),
    locked: false,
  };
}

/** Whole-pixel size that fits in `maxSide` a side, never enlarged. */
export function fitWithin(size: ImageSize, maxSide: number): ImageSize {
  const factor = Math.min(1, maxSide / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * factor)),
    height: Math.max(1, Math.round(size.height * factor)),
  };
}

/** pdf.js scale for a page `size` in points, rendered at `dpi`. */
export function pdfRenderScale(
  size: ImageSize,
  dpi: number,
  maxSide: number,
): number {
  const scale = dpi / 72;
  return Math.min(scale, maxSide / Math.max(size.width, size.height));
}
