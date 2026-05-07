import type { Position, WallSegment } from "@/types/map";
import { GRID_SIZE } from "@/lib/grid";
import { arePositionsEqual, getWallBlockKey, getWallCenter } from "./cells";
import type { WallEraseCandidate } from "./types";

export const selectFloorWalls = (
  walls: ReadonlyArray<WallSegment>,
  floorId: string,
): Array<WallSegment> => walls.filter((wall) => wall.floorId === floorId);

export const buildWallIndexByKey = (
  walls: ReadonlyArray<WallSegment>,
): Map<string, WallSegment> => {
  const index = new Map<string, WallSegment>();

  for (const wall of walls) {
    const key = getWallBlockKey(wall);
    if (!key) {
      continue;
    }

    index.set(key, wall);
  }

  return index;
};

const pointToWallCellDistanceSquared = (
  point: Position,
  center: Position,
): number => {
  const half = GRID_SIZE / 2;
  const dx = Math.max(Math.abs(point.x - center.x) - half, 0);
  const dy = Math.max(Math.abs(point.y - center.y) - half, 0);

  return dx * dx + dy * dy;
};

export const resolveWallEraseCandidate = (
  walls: ReadonlyArray<WallSegment>,
  floorId: string,
  pointer: Position,
  snappedPoint: Position,
): WallEraseCandidate | null => {
  const floorWalls = selectFloorWalls(walls, floorId);
  if (floorWalls.length === 0) {
    return null;
  }

  const index = buildWallIndexByKey(floorWalls);
  if (index.size === 0) {
    return null;
  }

  const key = getWallBlockKey({
    floorId,
    start: snappedPoint,
    end: snappedPoint,
  });

  if (!key) {
    return null;
  }

  const wall = index.get(key);
  if (!wall) {
    return null;
  }

  const center = getWallCenter(wall);
  if (!center) {
    return null;
  }

  return {
    key,
    wall,
    direction: "center",
    distanceSquared: pointToWallCellDistanceSquared(pointer, center),
  };
};

export const buildWallSnapPath = (
  from: Position,
  to: Position,
): Array<Position> => {
  const path: Array<Position> = [{ ...from }];

  if (arePositionsEqual(from, to)) {
    return path;
  }

  let cursor = { ...from };

  while (!arePositionsEqual(cursor, to)) {
    const dx = to.x - cursor.x;
    const dy = to.y - cursor.y;

    cursor =
      Math.abs(dx) >= Math.abs(dy) && dx !== 0
        ? { x: cursor.x + Math.sign(dx) * GRID_SIZE, y: cursor.y }
        : { x: cursor.x, y: cursor.y + Math.sign(dy) * GRID_SIZE };

    path.push(cursor);
  }

  return path;
};
