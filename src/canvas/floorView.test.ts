import { describe, expect, it } from "bun:test";
import { floorContentBounds, floorMinZoom } from "@/canvas/floorView";
import { FLOW_CANVAS_MIN_ZOOM } from "@/lib/constants";
import type { FloorId, OverlayFileId, WallId } from "@/types/map";
import { buildDevice } from "../../test/storeHarness";

const floorId = "floor-1" as FloorId;

describe("floorContentBounds", () => {
  it("covers devices, walls and the calque, not the devices alone", () => {
    const bounds = floorContentBounds({
      devices: [buildDevice({ position: { x: 100, y: 100 } })],
      walls: [
        {
          id: "wall-1" as WallId,
          floorId,
          start: { x: 0, y: 0 },
          end: { x: 400, y: 0 },
          color: "concrete",
          geometryKey: "k",
        },
      ],
      overlay: {
        floorId,
        fileId: "file-1" as OverlayFileId,
        imageWidth: 200,
        imageHeight: 100,
        center: { x: 300, y: 500 },
        scale: 1,
        rotation: 0,
        opacity: 1,
        locked: false,
      },
    });
    expect(bounds).toEqual({ x: -10, y: -10, width: 420, height: 560 });
  });

  it("has nothing to fit on an empty floor", () => {
    expect(floorContentBounds({ devices: [], walls: [], overlay: null })).toBe(
      null,
    );
  });
});

describe("floorMinZoom", () => {
  it("lets a floor wider than the screen be seen whole", () => {
    // 45 m by 34 m, a calibrated calque on a 1024 × 800 canvas (A26).
    const zoom = floorMinZoom(
      { x: 0, y: 0, width: 4555, height: 3416 },
      1024,
      800,
    );
    expect(zoom).toBeLessThan(FLOW_CANVAS_MIN_ZOOM);
    expect(4555 * zoom).toBeLessThanOrEqual(1024);
    expect(3416 * zoom).toBeLessThanOrEqual(800);
  });

  it("keeps the usual limit for a floor that already fits", () => {
    expect(
      floorMinZoom({ x: 0, y: 0, width: 1000, height: 600 }, 1024, 800),
    ).toBe(FLOW_CANVAS_MIN_ZOOM);
    expect(floorMinZoom(null, 1024, 800)).toBe(FLOW_CANVAS_MIN_ZOOM);
  });
});
