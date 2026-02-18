import type { Position, WallColor, WallSegment } from "@/types/map";

export const GRID_SIZE = 20;
export const WALL_GRID_OFFSET = GRID_SIZE / 2;
export const WALL_THICKNESS = GRID_SIZE;

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
    label: "Beton",
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

export const getWallRect = (
  wall: Pick<WallSegment, "start" | "end">,
): { x: number; y: number; width: number; height: number } => {
  if (wall.start.x === wall.end.x && wall.start.y === wall.end.y) {
    return {
      x: wall.start.x - GRID_SIZE / 2,
      y: wall.start.y - GRID_SIZE / 2,
      width: GRID_SIZE,
      height: GRID_SIZE,
    };
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

export const isPointOnWall = (
  point: Position,
  wall: Pick<WallSegment, "start" | "end">,
): boolean => {
  const rect = getWallRect(wall);

  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
};
