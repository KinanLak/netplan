import type { FloorId, Position, WallSegment } from "@/types/map";
import { GRID_SIZE } from "@/lib/grid";
import { WALL_ERASER_DEFAULT_SIZE, clampWallEraserSize } from "@/lib/constants";
import { rectanglesOverlap } from "@/lib/geometry";
import {
  arePositionsEqual,
  getWallBlockKey,
  getWallCenter,
  getWallCollisionRect,
  snapPositionToGrid,
  snapPositionToWallGrid,
} from "./cells";
import type { Rect, WallEraseCandidate } from "./types";

export const selectFloorWalls = (
  walls: ReadonlyArray<WallSegment>,
  floorId: FloorId,
): Array<WallSegment> => walls.filter((wall) => wall.floorId === floorId);

const pointToWallCellDistanceSquared = (
  point: Position,
  center: Position,
): number => {
  const half = GRID_SIZE / 2;
  const dx = Math.max(Math.abs(point.x - center.x) - half, 0);
  const dy = Math.max(Math.abs(point.y - center.y) - half, 0);

  return dx * dx + dy * dy;
};

export const getWallEraserRect = (
  pointer: Position,
  eraserSize: number,
): Rect => {
  const size = clampWallEraserSize(eraserSize);
  const side = size * GRID_SIZE;
  const center =
    size % 2 === 0
      ? snapPositionToGrid(pointer)
      : snapPositionToWallGrid(pointer);

  return {
    x: center.x - side / 2,
    y: center.y - side / 2,
    width: side,
    height: side,
  };
};

const rectsOverlap = (a: Rect, b: Rect): boolean =>
  rectanglesOverlap(
    { x: a.x, y: a.y },
    { width: a.width, height: a.height },
    { x: b.x, y: b.y },
    { width: b.width, height: b.height },
  );

export const resolveWallEraseCandidates = (
  walls: ReadonlyArray<WallSegment>,
  floorId: FloorId,
  pointer: Position,
  eraserSize: number,
): Array<WallEraseCandidate> => {
  const floorWalls = selectFloorWalls(walls, floorId);
  if (floorWalls.length === 0) {
    return [];
  }

  const eraserRect = getWallEraserRect(pointer, eraserSize);
  const candidates: Array<WallEraseCandidate> = [];

  for (const wall of floorWalls) {
    const key = getWallBlockKey(wall);
    if (!key) {
      continue;
    }

    const center = getWallCenter(wall);
    if (!center || !rectsOverlap(eraserRect, getWallCollisionRect(wall))) {
      continue;
    }

    candidates.push({
      key,
      wall,
      direction: "center",
      distanceSquared: pointToWallCellDistanceSquared(pointer, center),
    });
  }

  return candidates.toSorted(
    (a, b) =>
      a.distanceSquared - b.distanceSquared || a.key.localeCompare(b.key),
  );
};

export const resolveWallEraseCandidate = (
  walls: ReadonlyArray<WallSegment>,
  floorId: FloorId,
  pointer: Position,
  _snappedPoint: Position,
  eraserSize = WALL_ERASER_DEFAULT_SIZE,
): WallEraseCandidate | null => {
  return (
    resolveWallEraseCandidates(walls, floorId, pointer, eraserSize)[0] ?? null
  );
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
