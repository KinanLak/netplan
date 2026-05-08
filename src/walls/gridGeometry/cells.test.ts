import { describe, expect, it } from "bun:test";
import type { Device, WallSegment } from "@/types/map";
import {
  computeWallMaskBounds,
  getWallBlockKey,
  getWallCellRect,
  getWallCollisionRect,
  snapPositionToWallGrid,
  WALL_GRID_OFFSET,
  wallCollidesWithDevices,
} from "./cells";

const wall = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  floorId = "floor-a",
): WallSegment => ({
  id: "wall",
  floorId,
  start,
  end,
  color: "concrete",
});

const device = (
  position: { x: number; y: number },
  size = { width: 20, height: 20 },
): Device => ({
  id: "device",
  type: "pc",
  name: "PC",
  floorId: "floor-a",
  position,
  size,
  metadata: {},
});

describe("wall grid cell math", () => {
  it("snaps positions onto the wall-offset grid", () => {
    expect(snapPositionToWallGrid({ x: 12, y: 4 })).toEqual({
      x: WALL_GRID_OFFSET,
      y: WALL_GRID_OFFSET,
    });
    expect(snapPositionToWallGrid({ x: 33, y: 31 })).toEqual({
      x: 30,
      y: 30,
    });
  });

  it("returns a collision rect that matches the cell rect for single-cell walls", () => {
    const single = wall({ x: 10, y: 10 }, { x: 10, y: 10 });
    expect(getWallCollisionRect(single)).toEqual(getWallCellRect(single.start));
  });

  it("expands collision rects on the axis of horizontal and vertical walls", () => {
    const horizontal = wall({ x: 10, y: 30 }, { x: 70, y: 30 });
    const vertical = wall({ x: 30, y: 10 }, { x: 30, y: 90 });

    expect(getWallCollisionRect(horizontal)).toEqual({
      x: 10,
      y: 20,
      width: 60,
      height: 20,
    });
    expect(getWallCollisionRect(vertical)).toEqual({
      x: 20,
      y: 10,
      width: 20,
      height: 80,
    });
  });

  it("scopes wall block keys by floor id", () => {
    const onFloorA = wall({ x: 10, y: 10 }, { x: 10, y: 10 }, "floor-a");
    const onFloorB = wall({ x: 10, y: 10 }, { x: 10, y: 10 }, "floor-b");

    const keyA = getWallBlockKey(onFloorA);
    const keyB = getWallBlockKey(onFloorB);

    expect(keyA).toBe("floor-a:10:10");
    expect(keyB).toBe("floor-b:10:10");
    expect(keyA === keyB).toBe(false);
  });

  it("returns null block keys for diagonal walls", () => {
    const diagonal = wall({ x: 10, y: 10 }, { x: 30, y: 50 });
    expect(getWallBlockKey(diagonal)).toBe(null);
  });

  it("normalizes endpoint order so reversed walls share a block key", () => {
    const left = wall({ x: 10, y: 30 }, { x: 30, y: 30 });
    const right = wall({ x: 30, y: 30 }, { x: 10, y: 30 });
    expect(getWallBlockKey(left)).toBe(getWallBlockKey(right));
  });

  it("detects collisions between walls and overlapping devices", () => {
    const segment = wall({ x: 10, y: 30 }, { x: 70, y: 30 });
    const overlapping = device({ x: 30, y: 20 });
    const next = device({ x: 30, y: 40 });

    expect(wallCollidesWithDevices(segment, [overlapping])).toBe(true);
    expect(wallCollidesWithDevices(segment, [next])).toBe(false);
  });

  it("computes mask bounds with padding from a non-empty wall list", () => {
    const segment = wall({ x: 10, y: 30 }, { x: 70, y: 30 });
    const bounds = computeWallMaskBounds([segment], 10);

    expect(bounds).toEqual({
      x: 0,
      y: 10,
      width: 80,
      height: 40,
    });
  });

  it("returns undefined mask bounds for an empty wall list", () => {
    expect(computeWallMaskBounds([])).toBeUndefined();
  });
});
