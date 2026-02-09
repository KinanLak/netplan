import type { Position, WallColor, WallSegment } from "@/types/map";

export const GRID_SIZE = 20;
export const WALL_GRID_OFFSET = GRID_SIZE / 2;
// Une prise fait 40px de large, donc le mur fait 20px.
export const WALL_THICKNESS = 20;

export interface WallColorTone {
  label: string;
  fill: string;
  stroke: string;
}

export const WALL_COLOR_TONES: Record<WallColor, WallColorTone> = {
  sand: {
    label: "Sable",
    fill: "#d8c8b2",
    stroke: "#b59b7b",
  },
  concrete: {
    label: "Béton",
    fill: "#c3c8cf",
    stroke: "#8f98a3",
  },
  slate: {
    label: "Ardoise",
    fill: "#8f969f",
    stroke: "#5f6772",
  },
};

export const WALL_COLOR_ORDER: Array<WallColor> = ["sand", "concrete", "slate"];

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

export const normalizeWallSegmentPoints = (
  start: Position,
  end: Position,
): { start: Position; end: Position } | null => {
  if (start.x !== end.x && start.y !== end.y) {
    return null;
  }

  if (arePositionsEqual(start, end)) {
    return null;
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

export const isPointOnWall = (
  point: Position,
  wall: Pick<WallSegment, "start" | "end">,
): boolean => {
  if (wall.start.y === wall.end.y) {
    const minX = Math.min(wall.start.x, wall.end.x);
    const maxX = Math.max(wall.start.x, wall.end.x);
    return point.y === wall.start.y && point.x >= minX && point.x <= maxX;
  }

  const minY = Math.min(wall.start.y, wall.end.y);
  const maxY = Math.max(wall.start.y, wall.end.y);
  return point.x === wall.start.x && point.y >= minY && point.y <= maxY;
};

export const isPointConnectedToWalls = (
  point: Position,
  walls: Array<Pick<WallSegment, "start" | "end">>,
): boolean => {
  return walls.some((wall) => isPointOnWall(point, wall));
};

export const areSameWallGeometry = (
  first: Pick<WallSegment, "start" | "end">,
  second: Pick<WallSegment, "start" | "end">,
): boolean => {
  const a = normalizeWallSegmentPoints(first.start, first.end);
  const b = normalizeWallSegmentPoints(second.start, second.end);

  if (!a || !b) {
    return false;
  }

  return arePositionsEqual(a.start, b.start) && arePositionsEqual(a.end, b.end);
};

export const createOrthogonalWallSegment = (
  start: Position,
  end: Position,
  floorId: string,
  color: WallColor,
): Omit<WallSegment, "id"> | null => {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);

  const snappedEnd =
    dx >= dy ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
  const normalized = normalizeWallSegmentPoints(start, snappedEnd);

  if (!normalized) {
    return null;
  }

  return {
    floorId,
    color,
    start: normalized.start,
    end: normalized.end,
  };
};

export const createRoomWallSegments = (
  start: Position,
  end: Position,
  floorId: string,
  color: WallColor,
): Array<Omit<WallSegment, "id">> => {
  if (start.x === end.x || start.y === end.y) {
    return [];
  }

  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  const drafts = [
    { start: { x: left, y: top }, end: { x: right, y: top } },
    { start: { x: right, y: top }, end: { x: right, y: bottom } },
    { start: { x: left, y: bottom }, end: { x: right, y: bottom } },
    { start: { x: left, y: top }, end: { x: left, y: bottom } },
  ];

  return drafts
    .map((draft) => {
      const normalized = normalizeWallSegmentPoints(draft.start, draft.end);
      if (!normalized) {
        return null;
      }

      return {
        floorId,
        color,
        start: normalized.start,
        end: normalized.end,
      };
    })
    .filter((segment): segment is Omit<WallSegment, "id"> => segment !== null);
};

export const getWallRect = (
  wall: Pick<WallSegment, "start" | "end">,
): { x: number; y: number; width: number; height: number } => {
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
