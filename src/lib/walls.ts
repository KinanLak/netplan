import type {
  Position,
  WallColor,
  WallDraft,
  WallJunctions,
  WallSegment,
} from "@/types/map";

export const GRID_SIZE = 20;
export const WALL_GRID_OFFSET = GRID_SIZE / 2;
// Une prise fait 40px de large, donc le mur fait 20px.
export const WALL_THICKNESS = 15;

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

export const EMPTY_WALL_JUNCTIONS: WallJunctions = {
  left: false,
  right: false,
  up: false,
  down: false,
};

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

export const getWallGeometryKey = (
  wall: Pick<WallSegment, "start" | "end">,
): string | null => {
  const normalized = normalizeWallSegmentPoints(wall.start, wall.end);
  if (!normalized) {
    return null;
  }

  return `${normalized.start.x}:${normalized.start.y}:${normalized.end.x}:${normalized.end.y}`;
};

export const splitWallSegmentIntoBlocks = (
  segment: WallDraft,
): Array<WallDraft> => {
  const normalized = normalizeWallSegmentPoints(segment.start, segment.end);
  if (!normalized) {
    return [];
  }

  const blocks: Array<WallDraft> = [];

  if (normalized.start.y === normalized.end.y) {
    for (let x = normalized.start.x; x < normalized.end.x; x += GRID_SIZE) {
      const nextX = Math.min(x + GRID_SIZE, normalized.end.x);
      if (nextX === x) {
        continue;
      }

      blocks.push({
        floorId: segment.floorId,
        color: segment.color,
        start: { x, y: normalized.start.y },
        end: { x: nextX, y: normalized.start.y },
      });
    }

    return blocks;
  }

  for (let y = normalized.start.y; y < normalized.end.y; y += GRID_SIZE) {
    const nextY = Math.min(y + GRID_SIZE, normalized.end.y);
    if (nextY === y) {
      continue;
    }

    blocks.push({
      floorId: segment.floorId,
      color: segment.color,
      start: { x: normalized.start.x, y },
      end: { x: normalized.start.x, y: nextY },
    });
  }

  return blocks;
};

export const splitWallSegmentsIntoBlocks = (
  segments: Array<WallDraft>,
): Array<WallDraft> =>
  segments.flatMap((segment) => splitWallSegmentIntoBlocks(segment));

export const getWallIdsToDeleteFromSegments = (
  walls: Array<WallSegment>,
  segments: Array<WallDraft>,
): Set<string> => {
  if (segments.length === 0 || walls.length === 0) {
    return new Set();
  }

  const candidateBlocks = splitWallSegmentsIntoBlocks(segments);
  if (candidateBlocks.length === 0) {
    return new Set();
  }

  const candidateKeysByFloor = candidateBlocks.reduce<Map<string, Set<string>>>(
    (acc, block) => {
      const key = getWallGeometryKey(block);
      if (!key) {
        return acc;
      }

      const floorKeys = acc.get(block.floorId);
      if (floorKeys) {
        floorKeys.add(key);
        return acc;
      }

      acc.set(block.floorId, new Set([key]));
      return acc;
    },
    new Map(),
  );

  if (candidateKeysByFloor.size === 0) {
    return new Set();
  }

  const wallIdsToDelete = new Set<string>();

  for (const [floorId, floorCandidateKeys] of candidateKeysByFloor) {
    const floorWalls = walls.filter((wall) => wall.floorId === floorId);

    for (const wall of floorWalls) {
      const wallBlocks = splitWallSegmentsIntoBlocks([
        {
          floorId: wall.floorId,
          color: wall.color,
          start: wall.start,
          end: wall.end,
        },
      ]);

      const shouldDelete = wallBlocks.some((block) => {
        const key = getWallGeometryKey(block);
        return key ? floorCandidateKeys.has(key) : false;
      });

      if (shouldDelete) {
        wallIdsToDelete.add(wall.id);
      }
    }
  }

  return wallIdsToDelete;
};

export const createOrthogonalWallSegment = (
  start: Position,
  end: Position,
  floorId: string,
  color: WallColor,
): WallDraft | null => {
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
): Array<WallDraft> => {
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

  return drafts.reduce<Array<WallDraft>>((segments, draft) => {
    const normalized = normalizeWallSegmentPoints(draft.start, draft.end);
    if (!normalized) {
      return segments;
    }

    segments.push({
      floorId,
      color,
      start: normalized.start,
      end: normalized.end,
    });
    return segments;
  }, []);
};

const wallPointKey = (point: Position): string => `${point.x}:${point.y}`;

const getNodeDirections = (
  walls: Array<WallSegment>,
): Map<string, Set<keyof WallJunctions>> => {
  const nodeDirections = new Map<string, Set<keyof WallJunctions>>();

  const ensureNode = (point: Position): Set<keyof WallJunctions> => {
    const key = wallPointKey(point);
    let directions = nodeDirections.get(key);
    if (!directions) {
      directions = new Set<keyof WallJunctions>();
      nodeDirections.set(key, directions);
    }
    return directions;
  };

  for (const wall of walls) {
    const normalized = normalizeWallSegmentPoints(wall.start, wall.end);
    if (!normalized) {
      continue;
    }

    const startNode = ensureNode(normalized.start);
    const endNode = ensureNode(normalized.end);

    if (normalized.start.y === normalized.end.y) {
      startNode.add("right");
      endNode.add("left");
      continue;
    }

    startNode.add("down");
    endNode.add("up");
  }

  return nodeDirections;
};

export const applyWallJunctions = (
  walls: Array<WallSegment>,
): Array<WallSegment> => {
  if (walls.length === 0) {
    return walls;
  }

  const nodeDirections = getNodeDirections(walls);

  return walls.map((wall) => {
    const normalized = normalizeWallSegmentPoints(wall.start, wall.end);
    if (!normalized) {
      return {
        ...wall,
        junctions: { ...EMPTY_WALL_JUNCTIONS },
      };
    }

    const startDirections = nodeDirections.get(wallPointKey(normalized.start));
    const endDirections = nodeDirections.get(wallPointKey(normalized.end));
    const isHorizontal = normalized.start.y === normalized.end.y;

    const nextJunctions: WallJunctions = {
      left: isHorizontal
        ? !!startDirections?.has("left")
        : !!startDirections?.has("left") || !!endDirections?.has("left"),
      right: isHorizontal
        ? !!endDirections?.has("right")
        : !!startDirections?.has("right") || !!endDirections?.has("right"),
      up: isHorizontal
        ? !!startDirections?.has("up") || !!endDirections?.has("up")
        : !!startDirections?.has("up"),
      down: isHorizontal
        ? !!startDirections?.has("down") || !!endDirections?.has("down")
        : !!endDirections?.has("down"),
    };

    return {
      ...wall,
      junctions: nextJunctions,
    };
  });
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
