import type { Position, WallColor, WallDraft } from "@/types/map";
import { GRID_SIZE } from "@/lib/grid";
import { arePositionsEqual, normalizeWallBlockPoints } from "./cells";

export const createOrthogonalWallDraft = (
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

  const normalized = normalizeWallBlockPoints(start, projectedEnd);
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

export const createBrushWallDraft = (
  floorId: string,
  snappedPoint: Position,
  color: WallColor,
): WallDraft => ({
  floorId,
  start: snappedPoint,
  end: { x: snappedPoint.x + 1, y: snappedPoint.y },
  color,
});

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
    const normalized = normalizeWallBlockPoints(edge.start, edge.end);
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
  if (arePositionsEqual(start, end)) {
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
  const normalized = normalizeWallBlockPoints(draft.start, draft.end);
  if (!normalized) {
    return [];
  }

  return buildLineCenters(normalized.start, normalized.end).map((center) => ({
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
