import { describe, expect, it } from "bun:test";
import type { WallSegment } from "@/types/map";
import {
  addLine,
  addRoom,
  eraseAtPointer,
  eraseStroke,
  getWallBlockKey,
  previewEraseAtPointer,
} from "@/walls/engine";

const floorId = "floor-a";

const createWallIdFactory = () => {
  let index = 0;
  return () => `wall-${++index}`;
};

const toKeys = (walls: Array<WallSegment>): Array<string> =>
  walls
    .map((wall) => getWallBlockKey(wall))
    .filter((key): key is string => key !== null)
    .sort();

describe("wall engine commands", () => {
  it("splits horizontal lines into canonical grid blocks", () => {
    const result = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 70, y: 30 },
      generateWallId: createWallIdFactory(),
    });

    expect(result.changed).toBe(true);
    expect(result.reason).toBe("applied");
    expect(result.nextWalls).toHaveLength(4);
    expect(result.affectedKeys).toHaveLength(4);
  });

  it("splits vertical lines into canonical grid blocks", () => {
    const result = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 50, y: 10 },
      end: { x: 20, y: 70 },
      generateWallId: createWallIdFactory(),
    });

    expect(result.changed).toBe(true);
    expect(result.reason).toBe("applied");
    expect(result.nextWalls).toHaveLength(4);
    expect(result.affectedKeys).toHaveLength(4);
  });

  it("keeps junctions stable when crossing lines are added", () => {
    const first = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 70, y: 10 },
      generateWallId: createWallIdFactory(),
    });

    const second = addLine({
      walls: first.nextWalls,
      floorId,
      color: "concrete",
      start: { x: 50, y: -10 },
      end: { x: 50, y: 50 },
      generateWallId: createWallIdFactory(),
    });

    expect(second.changed).toBe(true);
    expect(second.nextWalls).toHaveLength(7);
    expect(new Set(toKeys(second.nextWalls)).size).toBe(7);
  });

  it("builds room perimeter as independent blocks", () => {
    const result = addRoom({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 70, y: 70 },
      generateWallId: createWallIdFactory(),
    });

    expect(result.changed).toBe(true);
    expect(result.nextWalls).toHaveLength(12);
    expect(result.affectedKeys).toHaveLength(12);
  });

  it("resolves preview and click erase with the exact same candidate", () => {
    const setup = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 30, y: 10 },
      generateWallId: createWallIdFactory(),
    });

    const pointerInput = {
      floorId,
      pointer: { x: 24, y: 12 },
      snappedPoint: { x: 10, y: 10 },
    };

    const preview = previewEraseAtPointer({
      walls: setup.nextWalls,
      ...pointerInput,
    });
    const click = eraseAtPointer({
      walls: setup.nextWalls,
      ...pointerInput,
    });

    expect(preview.changed).toBe(false);
    expect(preview.reason).toBe("preview-hit");
    expect(click.changed).toBe(true);
    expect(click.reason).toBe("applied");
    expect(preview.affectedKeys).toEqual(click.affectedKeys);
    expect(click.nextWalls).toHaveLength(1);
  });

  it("erases across drag stroke using repeated pointer resolution", () => {
    const setup = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 70, y: 10 },
      generateWallId: createWallIdFactory(),
    });

    const result = eraseStroke({
      walls: setup.nextWalls,
      floorId,
      fromPointer: { x: 12, y: 11 },
      fromSnappedPoint: { x: 10, y: 10 },
      toPointer: { x: 52, y: 11 },
      toSnappedPoint: { x: 50, y: 10 },
    });

    expect(result.changed).toBe(true);
    expect(result.reason).toBe("applied");
    expect(result.affectedKeys).toHaveLength(3);
    expect(result.nextWalls).toHaveLength(1);
  });

  it("is idempotent when adding an existing line", () => {
    const first = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 70, y: 10 },
      generateWallId: createWallIdFactory(),
    });

    const second = addLine({
      walls: first.nextWalls,
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 70, y: 10 },
      generateWallId: createWallIdFactory(),
    });

    expect(second.changed).toBe(false);
    expect(second.reason).toBe("already-exists");
    expect(second.nextWalls).toBe(first.nextWalls);
  });

  it("rejects line creation when a candidate block collides with devices", () => {
    const result = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 50, y: 10 },
      generateWallId: createWallIdFactory(),
      collidesWithBlock: (block) => block.start.x === 30,
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe("collision-with-device");
    expect(result.nextWalls).toHaveLength(0);
  });

  it("returns no-op when erasing where no wall exists", () => {
    const result = eraseAtPointer({
      walls: [],
      floorId,
      pointer: { x: 10, y: 10 },
      snappedPoint: { x: 10, y: 10 },
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe("no-wall-at-pointer");
  });

  it("does not erase adjacent cells when snapped cell is empty", () => {
    const setup = addLine({
      walls: [],
      floorId,
      color: "concrete",
      start: { x: 30, y: 10 },
      end: { x: 50, y: 10 },
      generateWallId: createWallIdFactory(),
    });

    const result = eraseAtPointer({
      walls: setup.nextWalls,
      floorId,
      pointer: { x: 14, y: 11 },
      snappedPoint: { x: 10, y: 10 },
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe("no-wall-at-pointer");
    expect(result.nextWalls).toHaveLength(2);
  });
});
