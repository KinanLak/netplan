import { describe, expect, it } from "bun:test";
import type { FloorId, WallSegment } from "@/types/map";
import type { Id } from "../../convex/_generated/dataModel";
import {
  computeMergedWallGroups,
  computeSingleWallPath,
  getWallBlockKey,
  getWallCellRect,
  getWallCollisionRect,
  resolveWallEraseCandidate,
} from "@/walls/gridGeometry";
import { getWallRenderRect } from "@/walls/gridGeometry/render";

const floorId = "floor-a" as FloorId;

const wall: WallSegment = {
  _id: "wall-1" as Id<"walls">,
  _creationTime: 0,
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

  it("renders a horizontal wall as a thick rectangular path", () => {
    const horizontal = {
      start: { x: 10, y: 10 },
      end: { x: 50, y: 10 },
    };

    expect(getWallRenderRect(horizontal)).toEqual({
      x: 0,
      y: 0,
      width: 60,
      height: 20,
    });
    expect(computeSingleWallPath(horizontal)).toBe(
      "M 0 0 L 60 0 L 60 20 L 0 20 Z",
    );
  });

  it("renders a vertical wall as a thick rectangular path", () => {
    const vertical = {
      start: { x: 10, y: 10 },
      end: { x: 10, y: 50 },
    };

    expect(getWallRenderRect(vertical)).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 60,
    });
    expect(computeSingleWallPath(vertical)).toBe(
      "M 0 0 L 20 0 L 20 60 L 0 60 Z",
    );
  });

  it("merges same-colored connected walls into a rounded union path", () => {
    const groups = computeMergedWallGroups([
      {
        start: { x: 10, y: 10 },
        end: { x: 50, y: 10 },
        color: "concrete",
      },
      {
        start: { x: 10, y: 10 },
        end: { x: 10, y: 50 },
        color: "concrete",
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].color).toBe("concrete");
    expect(groups[0].path).toContain("Q");
    expect(groups[0].path).toContain("Z");
  });

  it("keeps wall colors in separate merged groups", () => {
    const groups = computeMergedWallGroups([
      {
        start: { x: 10, y: 10 },
        end: { x: 50, y: 10 },
        color: "concrete",
      },
      {
        start: { x: 10, y: 50 },
        end: { x: 50, y: 50 },
        color: "slate",
      },
    ]);

    expect(groups.map((group) => group.color).sort()).toEqual([
      "concrete",
      "slate",
    ]);
    expect(groups.every((group) => group.path.endsWith("Z"))).toBe(true);
  });

  it("returns no merged groups for an empty wall list", () => {
    expect(computeMergedWallGroups([])).toEqual([]);
  });
});
