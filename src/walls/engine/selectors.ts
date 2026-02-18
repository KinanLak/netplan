import { getWallBlockKey, getWallCenter, normalizeBlockPoints } from "./keys";
import type { Position, WallColor, WallDraft, WallSegment } from "@/types/map";
import { GRID_SIZE } from "@/lib/walls";

export type EraseDirection = "center" | "east" | "west" | "north" | "south";

export interface EraseCandidate {
  key: string;
  wall: WallSegment;
  direction: EraseDirection;
  distanceSquared: number;
}

export const arePositionsEqual = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

export const createOrthogonalLineDraft = (
  start: Position,
  end: Position,
  floorId: string,
  color: WallColor,
): WallDraft | null => {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const projectedEnd =
    dx >= dy ? { x: end.x, y: start.y } : { x: start.x, y: end.y };

  if (arePositionsEqual(start, projectedEnd)) {
    return null;
  }

  const normalized = normalizeBlockPoints(start, projectedEnd);
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

export const createRoomWallDrafts = (
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

  const edges = [
    { start: { x: left, y: top }, end: { x: right, y: top } },
    { start: { x: right, y: top }, end: { x: right, y: bottom } },
    { start: { x: left, y: bottom }, end: { x: right, y: bottom } },
    { start: { x: left, y: top }, end: { x: left, y: bottom } },
  ];

  return edges.reduce<Array<WallDraft>>((acc, edge) => {
    const normalized = normalizeBlockPoints(edge.start, edge.end);
    if (!normalized) {
      return acc;
    }

    acc.push({
      floorId,
      color,
      start: normalized.start,
      end: normalized.end,
    });

    return acc;
  }, []);
};

const buildLineCenters = (start: Position, end: Position): Array<Position> => {
  if (start.x === end.x && start.y === end.y) {
    return [{ ...start }];
  }

  if (start.y === end.y) {
    const step = start.x <= end.x ? GRID_SIZE : -GRID_SIZE;
    const centers: Array<Position> = [];

    if (step > 0) {
      for (let x = start.x; x <= end.x; x += step) {
        centers.push({ x, y: start.y });
      }
    } else {
      for (let x = start.x; x >= end.x; x += step) {
        centers.push({ x, y: start.y });
      }
    }

    return centers;
  }

  const step = start.y <= end.y ? GRID_SIZE : -GRID_SIZE;
  const centers: Array<Position> = [];

  if (step > 0) {
    for (let y = start.y; y <= end.y; y += step) {
      centers.push({ x: start.x, y });
    }
  } else {
    for (let y = start.y; y >= end.y; y += step) {
      centers.push({ x: start.x, y });
    }
  }

  return centers;
};

export const splitWallDraftIntoBlocks = (
  draft: WallDraft,
): Array<WallDraft> => {
  const normalized = normalizeBlockPoints(draft.start, draft.end);
  if (!normalized) {
    return [];
  }

  const centers = buildLineCenters(normalized.start, normalized.end);

  return centers.map((center) => ({
    floorId: draft.floorId,
    color: draft.color,
    start: center,
    end: center,
  }));
};

export const splitWallDraftsIntoBlocks = (
  drafts: ReadonlyArray<WallDraft>,
): Array<WallDraft> =>
  drafts.flatMap((draft) => splitWallDraftIntoBlocks(draft));

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

const getEraseCandidatePoints = (
  snappedPoint: Position,
): Array<{ direction: EraseDirection; center: Position }> => [
  { direction: "center", center: snappedPoint },
  {
    direction: "east",
    center: { x: snappedPoint.x + GRID_SIZE, y: snappedPoint.y },
  },
  {
    direction: "west",
    center: { x: snappedPoint.x - GRID_SIZE, y: snappedPoint.y },
  },
  {
    direction: "north",
    center: { x: snappedPoint.x, y: snappedPoint.y - GRID_SIZE },
  },
  {
    direction: "south",
    center: { x: snappedPoint.x, y: snappedPoint.y + GRID_SIZE },
  },
];

const pointToWallCellDistanceSquared = (
  point: Position,
  center: Position,
): number => {
  const half = GRID_SIZE / 2;
  const dx = Math.max(Math.abs(point.x - center.x) - half, 0);
  const dy = Math.max(Math.abs(point.y - center.y) - half, 0);

  return dx * dx + dy * dy;
};

export const resolveEraseCandidate = (
  walls: ReadonlyArray<WallSegment>,
  floorId: string,
  pointer: Position,
  snappedPoint: Position,
): EraseCandidate | null => {
  const floorWalls = selectFloorWalls(walls, floorId);
  if (floorWalls.length === 0) {
    return null;
  }

  const index = buildWallIndexByKey(floorWalls);
  if (index.size === 0) {
    return null;
  }

  const candidates = getEraseCandidatePoints(snappedPoint);
  let bestCandidate: EraseCandidate | null = null;

  for (const candidate of candidates) {
    const key = getWallBlockKey({
      floorId,
      start: candidate.center,
      end: candidate.center,
    });

    if (!key) {
      continue;
    }

    const wall = index.get(key);
    if (!wall) {
      continue;
    }

    const center = getWallCenter(wall);
    if (!center) {
      continue;
    }

    const distanceSquared = pointToWallCellDistanceSquared(pointer, center);

    if (!bestCandidate || distanceSquared < bestCandidate.distanceSquared) {
      bestCandidate = {
        key,
        wall,
        direction: candidate.direction,
        distanceSquared,
      };
    }
  }

  return bestCandidate;
};

export const buildSnapPath = (
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
