import type { Device, Position } from "@/types/map";
import { GRID_SIZE } from "@/lib/grid";
import { rectanglesOverlap } from "@/lib/geometry";
import type {
  FloorWallShape,
  NormalizedWallPoints,
  Rect,
  WallShape,
} from "./types";

export const WALL_GRID_OFFSET = GRID_SIZE / 2;
export const WALL_THICKNESS = GRID_SIZE;

export const arePositionsEqual = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

export const snapToGrid = (value: number): number =>
  Math.round(value / GRID_SIZE) * GRID_SIZE;

export const snapToWallGrid = (value: number): number =>
  Math.round((value - WALL_GRID_OFFSET) / GRID_SIZE) * GRID_SIZE +
  WALL_GRID_OFFSET;

export const snapPositionToGrid = (position: Position): Position => ({
  x: snapToGrid(position.x),
  y: snapToGrid(position.y),
});

export const snapPositionToWallGrid = (position: Position): Position => ({
  x: snapToWallGrid(position.x),
  y: snapToWallGrid(position.y),
});

export const getWallCellRect = (center: Position): Rect => ({
  x: center.x - GRID_SIZE / 2,
  y: center.y - GRID_SIZE / 2,
  width: GRID_SIZE,
  height: GRID_SIZE,
});

export const normalizeWallBlockPoints = (
  start: Position,
  end: Position,
): NormalizedWallPoints | null => {
  if (start.x !== end.x && start.y !== end.y) {
    return null;
  }

  if (arePositionsEqual(start, end)) {
    return { start, end };
  }

  if (start.y === end.y) {
    return start.x <= end.x
      ? { start, end }
      : { start: { ...end }, end: { ...start } };
  }

  return start.y <= end.y
    ? { start, end }
    : { start: { ...end }, end: { ...start } };
};

export const getWallGeometryKey = (wall: WallShape): string | null => {
  const normalized = normalizeWallBlockPoints(wall.start, wall.end);
  if (!normalized) {
    return null;
  }

  return `${normalized.start.x}:${normalized.start.y}:${normalized.end.x}:${normalized.end.y}`;
};

export const getWallCenter = (wall: WallShape): Position | null => {
  const normalized = normalizeWallBlockPoints(wall.start, wall.end);
  if (!normalized) {
    return null;
  }

  return {
    x: (normalized.start.x + normalized.end.x) / 2,
    y: (normalized.start.y + normalized.end.y) / 2,
  };
};

export const getWallBlockKey = (wall: FloorWallShape): string | null => {
  const center = getWallCenter(wall);
  return center ? `${wall.floorId}:${center.x}:${center.y}` : null;
};

export const getWallCollisionRect = (wall: WallShape): Rect => {
  if (arePositionsEqual(wall.start, wall.end)) {
    return getWallCellRect(wall.start);
  }

  if (wall.start.y === wall.end.y) {
    const minX = Math.min(wall.start.x, wall.end.x);
    const length = Math.abs(wall.end.x - wall.start.x);

    return {
      x: minX,
      y: wall.start.y - WALL_THICKNESS / 2,
      width: length,
      height: WALL_THICKNESS,
    };
  }

  const minY = Math.min(wall.start.y, wall.end.y);
  const length = Math.abs(wall.end.y - wall.start.y);

  return {
    x: wall.start.x - WALL_THICKNESS / 2,
    y: minY,
    width: WALL_THICKNESS,
    height: length,
  };
};

export const isPointOnWall = (point: Position, wall: WallShape): boolean => {
  const rect = getWallCollisionRect(wall);

  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
};

export const wallCollidesWithDevices = (
  wall: WallShape,
  devices: ReadonlyArray<Device>,
): boolean => {
  const wallRect = getWallCollisionRect(wall);
  return devices.some((device) =>
    rectanglesOverlap(
      { x: wallRect.x, y: wallRect.y },
      { width: wallRect.width, height: wallRect.height },
      device.position,
      device.size,
    ),
  );
};

export function computeWallMaskBounds(
  walls: ReadonlyArray<WallShape>,
  padding = GRID_SIZE,
): Rect | undefined {
  if (walls.length === 0) {
    return undefined;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const wall of walls) {
    const rect = getWallCollisionRect(wall);
    minX = Math.min(minX, rect.x - padding);
    minY = Math.min(minY, rect.y - padding);
    maxX = Math.max(maxX, rect.x + rect.width + padding);
    maxY = Math.max(maxY, rect.y + rect.height + padding);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
