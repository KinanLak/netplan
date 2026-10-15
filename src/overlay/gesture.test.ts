import { describe, expect, it } from "bun:test";
import { applyOverlayPatch } from "@/map-engine/overlay";
import type { FloorId, FloorOverlay, OverlayFileId } from "@/types/map";
import { gesturePatch, overlayCorner, patchChangesOverlay } from "./gesture";
import type { OverlayCorner } from "./gesture";

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

describe("overlayCorner", () => {
  it("turns with the calque", () => {
    expectPoint(overlayCorner(overlay(), { x: 1, y: 1 }), { x: 200, y: 100 });
    // A quarter turn clockwise brings the bottom-right corner to bottom-left.
    expectPoint(overlayCorner(overlay({ rotation: 90 }), { x: 1, y: 1 }), {
      x: 50,
      y: 150,
    });
  });
});

describe("gesturePatch", () => {
  it("moves the calque by the pointer's travel", () => {
    const patch = gesturePatch(
      { kind: "move", overlay: overlay(), from: { x: 10, y: 10 } },
      { x: 40, y: -10 },
      false,
    );
    expect(patch).toEqual({ center: { x: 130, y: 30 } });
  });

  it("resizes from a corner while the opposite corner stays put", () => {
    for (const rotation of [0, 30, 270]) {
      const start = overlay({ rotation });
      const corner: OverlayCorner = { x: 1, y: -1 };
      const opposite: OverlayCorner = { x: -1, y: 1 };
      const grabbed = overlayCorner(start, corner);
      const anchor = overlayCorner(start, opposite);
      // Drag the corner to twice its distance from the anchor.
      const pointer = {
        x: anchor.x + 2 * (grabbed.x - anchor.x),
        y: anchor.y + 2 * (grabbed.y - anchor.y),
      };
      const resized = applyOverlayPatch(
        start,
        gesturePatch(
          { kind: "resize", overlay: start, from: grabbed, corner },
          pointer,
          false,
        ),
      );
      expect(resized.scale).toBeCloseTo(1);
      expectPoint(overlayCorner(resized, opposite), anchor);
      expectPoint(overlayCorner(resized, corner), pointer);
    }
  });

  it("keeps the proportions when the pointer leaves the diagonal", () => {
    const start = overlay();
    const corner: OverlayCorner = { x: 1, y: 1 };
    const patch = gesturePatch(
      { kind: "resize", overlay: start, from: { x: 200, y: 100 }, corner },
      { x: 400, y: 100 },
      false,
    );
    const resized = applyOverlayPatch(start, patch);
    // Only the pointer's travel along the diagonal counts.
    expect(resized.scale).toBeCloseTo(0.9);
    expectPoint(overlayCorner(resized, { x: -1, y: -1 }), { x: 0, y: 0 });
  });

  it("never flips or collapses the calque past its anchor", () => {
    const patch = gesturePatch(
      {
        kind: "resize",
        overlay: overlay(),
        from: { x: 200, y: 100 },
        corner: { x: 1, y: 1 },
      },
      { x: -500, y: -500 },
      false,
    );
    expect(patch.scale).toBeGreaterThan(0);
  });

  it("rotates by the angle the pointer sweeps around the centre", () => {
    const gesture = {
      kind: "rotate" as const,
      overlay: overlay({ rotation: 350 }),
      from: { x: 100, y: -50 },
    };
    // From straight above the centre to its right: a quarter turn clockwise.
    expect(gesturePatch(gesture, { x: 200, y: 50 }, false)).toEqual({
      rotation: 80,
    });
    expect(gesturePatch(gesture, { x: 200, y: 40 }, true)).toEqual({
      rotation: 75,
    });
  });
});

describe("patchChangesOverlay", () => {
  it("tells a real change from a click that moved nothing", () => {
    const current = overlay();
    expect(patchChangesOverlay(current, { center: { x: 100, y: 50 } })).toBe(
      false,
    );
    expect(patchChangesOverlay(current, { rotation: 0, opacity: 0.6 })).toBe(
      false,
    );
    expect(patchChangesOverlay(current, { opacity: 0.4 })).toBe(true);
    expect(patchChangesOverlay(current, { locked: true })).toBe(true);
  });
});
