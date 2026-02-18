import type { Position, WallDraft, WallSegment } from "@/types/map";

export interface NormalizedPoints {
  start: Position;
  end: Position;
}

export const normalizeBlockPoints = (
  start: Position,
  end: Position,
): NormalizedPoints | null => {
  if (start.x !== end.x && start.y !== end.y) {
    return null;
  }

  if (start.x === end.x && start.y === end.y) {
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

export const getWallGeometryKey = (
  wall: Pick<WallSegment, "start" | "end"> | Pick<WallDraft, "start" | "end">,
): string | null => {
  const normalized = normalizeBlockPoints(wall.start, wall.end);
  if (!normalized) {
    return null;
  }

  return `${normalized.start.x}:${normalized.start.y}:${normalized.end.x}:${normalized.end.y}`;
};

export const getWallCenter = (
  wall: Pick<WallSegment, "start" | "end"> | Pick<WallDraft, "start" | "end">,
): Position | null => {
  const normalized = normalizeBlockPoints(wall.start, wall.end);
  if (!normalized) {
    return null;
  }

  return {
    x: (normalized.start.x + normalized.end.x) / 2,
    y: (normalized.start.y + normalized.end.y) / 2,
  };
};

export const getWallBlockKey = (
  wall:
    | Pick<WallSegment, "floorId" | "start" | "end">
    | Pick<WallDraft, "floorId" | "start" | "end">,
): string | null => {
  const center = getWallCenter(wall);
  return center ? `${wall.floorId}:${center.x}:${center.y}` : null;
};
