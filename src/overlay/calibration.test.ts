import { describe, expect, it } from "bun:test";
import { applyOverlayPatch } from "@/map-engine/overlay";
import type { FloorId, FloorOverlay, OverlayFileId } from "@/types/map";
import {
  calibrationMetres,
  calibrationPatch,
  imageToPlan,
  isInsideImage,
  overlayBounds,
  planToImage,
} from "./calibration";

// 400 × 200 px at scale 0.5: 200 × 100 plan units, centred on (100, 50).
const overlay = (changes: Partial<FloorOverlay> = {}): FloorOverlay => ({
  floorId: "floor:a" as FloorId,
  fileId: "overlay-file:a" as OverlayFileId,
  imageWidth: 400,
  imageHeight: 200,
  center: { x: 100, y: 50 },
  scale: 0.5,
  rotation: 0,
  opacity: 0.6,
  locked: false,
  ...changes,
});

const expectPoint = (
  actual: { x: number; y: number },
  expected: { x: number; y: number },
) => {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
};

describe("image and plan coordinates", () => {
  it("map the image's corners onto the calque's frame", () => {
    expectPoint(imageToPlan(overlay(), { x: 0, y: 0 }), { x: 0, y: 0 });
    expectPoint(imageToPlan(overlay(), { x: 400, y: 200 }), { x: 200, y: 100 });
  });

  it("are inverse of each other on a rotated calque", () => {
    const rotated = overlay({ rotation: 37, scale: 1.3 });
    const pixel = { x: 120, y: 45 };
    expectPoint(planToImage(rotated, imageToPlan(rotated, pixel)), pixel);
  });

  it("turn with the calque", () => {
    // A quarter turn clockwise puts the image's top-left at the frame's top-right.
    expectPoint(imageToPlan(overlay({ rotation: 90 }), { x: 0, y: 0 }), {
      x: 150,
      y: -50,
    });
  });

  it("tell a pixel of the image from one outside it", () => {
    expect(isInsideImage(overlay(), { x: 400, y: 0 })).toBe(true);
    expect(isInsideImage(overlay(), { x: 401, y: 10 })).toBe(false);
    expect(isInsideImage(overlay(), { x: 10, y: -1 })).toBe(false);
  });
});

describe("calibrationPatch", () => {
  it("puts the two points the typed distance apart", () => {
    const before = overlay({ rotation: 30 });
    const a = { x: 50, y: 50 };
    const b = { x: 250, y: 150 };
    const result = calibrationPatch(before, a, b, 7.5);
    if (!result.ok) throw new Error(result.reason);
    const after = applyOverlayPatch(before, result.patch);

    expect(calibrationMetres(after, a, b)).toBeCloseTo(7.5);
    const pa = imageToPlan(after, a);
    const pb = imageToPlan(after, b);
    expect(Math.hypot(pb.x - pa.x, pb.y - pa.y)).toBeCloseTo(750);
  });

  it("keeps the first point where it was on the plan", () => {
    const before = overlay({ rotation: 30 });
    const a = { x: 50, y: 50 };
    const result = calibrationPatch(before, a, { x: 250, y: 150 }, 20);
    if (!result.ok) throw new Error(result.reason);
    const after = applyOverlayPatch(before, result.patch);

    expectPoint(imageToPlan(after, a), imageToPlan(before, a));
    expect(after.rotation).toBe(30);
  });

  it("refuses points too close to measure", () => {
    expect(
      calibrationPatch(overlay(), { x: 10, y: 10 }, { x: 14, y: 13 }, 1),
    ).toEqual({ ok: false, reason: "points-too-close" });
  });

  it("refuses a distance the calque cannot be scaled to", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    for (const metres of [0, -2, Number.NaN, 2_000_000]) {
      expect(calibrationPatch(overlay(), a, b, metres)).toEqual({
        ok: false,
        reason: "invalid-distance",
      });
    }
  });

  it("refuses a scale in bounds that moves the calque off the plan", () => {
    // Grown 500 times about its left edge, the centre lands 2 km away.
    const wide = overlay({
      imageWidth: 8192,
      center: { x: 0, y: 0 },
      scale: 1,
    });
    expect(
      calibrationPatch(wide, { x: 10, y: 100 }, { x: 30, y: 100 }, 100),
    ).toEqual({ ok: false, reason: "invalid-distance" });
  });
});

describe("overlayBounds", () => {
  it("covers the calque on the plan, turned or not", () => {
    expect(overlayBounds(overlay())).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    // A quarter turn swaps its sides around the same centre.
    const turned = overlayBounds(overlay({ rotation: 90 }));
    expect(turned.x).toBeCloseTo(50);
    expect(turned.y).toBeCloseTo(-50);
    expect(turned.width).toBeCloseTo(100);
    expect(turned.height).toBeCloseTo(200);
  });
});
