import { describe, expect, it } from "bun:test";
import type { FloorId, OverlayFileId } from "@/types/map";
import {
  fitWithin,
  initialOverlay,
  pdfRenderScale,
  replacedOverlay,
} from "./placement";

const floorId = "floor:a" as FloorId;
const file = (width: number, height: number) => ({
  fileId: `overlay-file:${width}x${height}` as OverlayFileId,
  width,
  height,
});

describe("initialOverlay", () => {
  it("centres the calque in view and fits its tighter side to 80%", () => {
    const overlay = initialOverlay(floorId, file(2000, 1000), {
      x: -500,
      y: 100,
      width: 1000,
      height: 1000,
    });
    expect(overlay.center).toEqual({ x: 0, y: 600 });
    expect(overlay.scale).toBeCloseTo(0.4);
    expect(overlay).toMatchObject({ rotation: 0, locked: false, floorId });
  });
});

describe("replacedOverlay", () => {
  it("keeps the place, angle and width on the plan of the calque it replaces", () => {
    const current = {
      ...initialOverlay(floorId, file(1000, 500), {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
      }),
      rotation: 90,
      opacity: 0.3,
    };
    const next = replacedOverlay(current, file(4000, 3000));
    expect(next.imageWidth * next.scale).toBeCloseTo(
      current.imageWidth * current.scale,
    );
    expect(next).toMatchObject({
      center: current.center,
      rotation: 90,
      opacity: 0.3,
      fileId: "overlay-file:4000x3000",
      imageHeight: 3000,
    });
  });
});

describe("raster sizes", () => {
  it("shrinks to the longest side and never enlarges", () => {
    expect(fitWithin({ width: 10_000, height: 5_000 }, 8192)).toEqual({
      width: 8192,
      height: 4096,
    });
    expect(fitWithin({ width: 300, height: 200 }, 8192)).toEqual({
      width: 300,
      height: 200,
    });
  });

  it("renders a PDF page at the asked resolution unless it gets too large", () => {
    // A4 in points.
    expect(pdfRenderScale({ width: 595, height: 842 }, 144, 8192)).toBe(2);
    // A0 at 200 dpi would be 9 362 px wide.
    const a0 = { width: 2384, height: 3370 };
    expect(3370 * pdfRenderScale(a0, 200, 8192)).toBeCloseTo(8192);
  });
});
