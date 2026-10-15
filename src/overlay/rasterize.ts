import { OVERLAY_MAX_FILE_BYTES } from "@/map-engine/overlay";
import { fitWithin } from "./placement";
import type { ImageSize } from "./placement";

// Every import becomes a PNG or JPEG here (ADR 0024): the server stores no
// SVG or PDF, so nothing it hands out can run a script or reach the network.

/** Below the server's limit, and a canvas every desktop browser can hold. */
export const OVERLAY_RASTER_MAX_SIDE = 8192;
/** A vector drawing has no pixel size; this one is sharp at street zoom. */
const SVG_RASTER_LONG_SIDE = 4096;
const JPEG_QUALITY = 0.9;
const SHRINK_FACTOR = 0.75;
const MAX_ENCODE_ATTEMPTS = 5;

export type OverlaySourceKind = "png" | "jpeg" | "svg" | "pdf";

export type OverlayImportErrorCode =
  | "unsupported-file"
  | "unreadable-file"
  | "pdf-password"
  | "too-large";

export class OverlayImportError extends Error {
  readonly code: OverlayImportErrorCode;

  constructor(code: OverlayImportErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.code = code;
  }
}

export interface RasterOverlay extends ImageSize {
  bytes: ArrayBuffer;
}

export const OVERLAY_FILE_ACCEPT =
  ".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf";

export function overlaySourceKind(
  file: Pick<File, "name" | "type">,
): OverlaySourceKind | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/png" || name.endsWith(".png")) return "png";
  if (type === "image/jpeg" || /\.jpe?g$/.test(name)) return "jpeg";
  if (type === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return null;
}

const svgLength = (value: string | null): number | null => {
  if (!value) return null;
  const match = /^\s*([\d.]+)\s*(px)?\s*$/.exec(value);
  const length = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(length) && length > 0 ? length : null;
};

/** Width over height from the root's size or viewBox; null when it has none. */
export function svgAspectRatio(source: string): number | null {
  const root = new DOMParser().parseFromString(
    source,
    "image/svg+xml",
  ).documentElement;
  if (root.nodeName.toLowerCase() !== "svg") return null;
  const width = svgLength(root.getAttribute("width"));
  const height = svgLength(root.getAttribute("height"));
  if (width && height) return width / height;
  const viewBox = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return viewBox[2] / viewBox[3];
  }
  return null;
}

const canvasBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new OverlayImportError("unreadable-file")),
        type,
        quality,
      );
    } catch (error) {
      // A tainted canvas (an SVG with foreignObject in some browsers).
      reject(new OverlayImportError("unreadable-file", { cause: error }));
    }
  });

/**
 * Draws at `size` and encodes, trying PNG (lossless, small for line drawings)
 * then JPEG, then smaller sizes until the file fits the upload limit.
 */
export async function encodeOverlay(
  size: ImageSize,
  draw: (canvas: HTMLCanvasElement, size: ImageSize) => Promise<void> | void,
  { preferJpeg = false }: { preferJpeg?: boolean } = {},
): Promise<RasterOverlay> {
  let target = fitWithin(size, OVERLAY_RASTER_MAX_SIDE);
  for (let attempt = 0; attempt < MAX_ENCODE_ATTEMPTS; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    try {
      await draw(canvas, target);
      if (!preferJpeg) {
        const png = await canvasBlob(canvas, "image/png");
        if (png.size <= OVERLAY_MAX_FILE_BYTES) {
          return { ...target, bytes: await png.arrayBuffer() };
        }
      }
      // JPEG has no transparency: paint what was transparent white.
      const flat = document.createElement("canvas");
      flat.width = target.width;
      flat.height = target.height;
      const context = flat.getContext("2d");
      if (!context) throw new OverlayImportError("unreadable-file");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, flat.width, flat.height);
      context.drawImage(canvas, 0, 0);
      const jpeg = await canvasBlob(flat, "image/jpeg", JPEG_QUALITY);
      flat.width = 0;
      if (jpeg.size <= OVERLAY_MAX_FILE_BYTES) {
        return { ...target, bytes: await jpeg.arrayBuffer() };
      }
    } finally {
      // Frees the backing store now rather than at the next collection.
      canvas.width = 0;
    }
    target = fitWithin(
      target,
      Math.floor(Math.max(target.width, target.height) * SHRINK_FACTOR),
    );
  }
  throw new OverlayImportError("too-large");
}

const context2d = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("2d");
  if (!context) throw new OverlayImportError("unreadable-file");
  return context;
};

/**
 * Re-encodes a PNG or JPEG rather than uploading it as is: the browser
 * applies the EXIF orientation while decoding, so the stored pixels match
 * what the user saw, and metadata such as GPS tags is dropped.
 */
async function rasterizeBitmap(
  file: File,
  kind: "png" | "jpeg",
): Promise<RasterOverlay> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new OverlayImportError("unreadable-file", { cause: error });
  }
  try {
    return await encodeOverlay(
      bitmap,
      (canvas, size) =>
        context2d(canvas).drawImage(bitmap, 0, 0, size.width, size.height),
      { preferJpeg: kind === "jpeg" },
    );
  } finally {
    bitmap.close();
  }
}

/**
 * An SVG is drawn through an `<img>`, where browsers run no script and load
 * no external resource, then only its pixels leave the browser.
 */
async function rasterizeSvg(file: File): Promise<RasterOverlay> {
  const source = await file.text();
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch (error) {
      throw new OverlayImportError("unreadable-file", { cause: error });
    }
    const ratio =
      svgAspectRatio(source) ??
      (image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1);
    const size =
      ratio >= 1
        ? { width: SVG_RASTER_LONG_SIDE, height: SVG_RASTER_LONG_SIDE / ratio }
        : { width: SVG_RASTER_LONG_SIDE * ratio, height: SVG_RASTER_LONG_SIDE };
    return await encodeOverlay(
      { width: Math.round(size.width), height: Math.round(size.height) },
      (canvas, target) =>
        context2d(canvas).drawImage(image, 0, 0, target.width, target.height),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PNG, JPEG or SVG to upload-ready bytes; a PDF goes through `pdf.ts`. */
export function rasterizeImageFile(
  file: File,
  kind: Exclude<OverlaySourceKind, "pdf">,
): Promise<RasterOverlay> {
  return kind === "svg" ? rasterizeSvg(file) : rasterizeBitmap(file, kind);
}
