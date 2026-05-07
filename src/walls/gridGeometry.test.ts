import { describe, expect, it } from "bun:test";
import type { WallSegment } from "@/types/map";
import {
  computeMergedWallGroups,
  computeSingleWallPath,
  getWallBlockKey,
  getWallCellRect,
  getWallCollisionRect,
  resolveWallEraseCandidate,
} from "@/walls/gridGeometry";

const floorId = "floor-a";

const wall: WallSegment = {
  id: "wall-1",
  floorId,
  start: { x: 10, y: 10 },
  end: { x: 10, y: 10 },
  color: "concrete",
};

describe("wall grid geometry", () => {
  it("maps one wall cell consistently across identity, erasing, collision, and rendering", () => {
    const key = getWallBlockKey(wall);
    const collisionRect = getWallCollisionRect(wall);
    const cellRect = getWallCellRect(wall.start);
    const eraseCandidate = resolveWallEraseCandidate(
      [wall],
      floorId,
      { x: 12, y: 12 },
      wall.start,
    );
    const singlePath = computeSingleWallPath(wall);
    const mergedGroups = computeMergedWallGroups([wall]);

    expect(key).toBe(`${floorId}:10:10`);
    expect(eraseCandidate?.key).toBe(key);
    expect(collisionRect).toEqual(cellRect);
    expect(collisionRect).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(singlePath).toBeTruthy();
    expect(mergedGroups[0].path).toBeTruthy();
    expect(mergedGroups[0].color).toBe("concrete");
  });
});
