import type { Position, WallColor, WallSegment } from "@/types/map";
import { GRID_SIZE, WALL_THICKNESS } from "@/lib/walls";

export interface MergedWallGroup {
  color: WallColor;
  path: string;
}

const CORNER_RADIUS = 8;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DirectedEdge {
  from: Position;
  to: Position;
}

type WallLike = Pick<WallSegment, "start" | "end" | "color">;

export function computeMergedWallGroups(
  walls: ReadonlyArray<WallLike>,
): Array<MergedWallGroup> {
  const groups = new Map<WallColor, Array<WallLike>>();

  for (const wall of walls) {
    const list = groups.get(wall.color);
    if (list) {
      list.push(wall);
    } else {
      groups.set(wall.color, [wall]);
    }
  }

  const merged: Array<MergedWallGroup> = [];

  for (const [color, colorWalls] of groups) {
    const rects = colorWalls.map((wall) => getWallRenderRect(wall));
    const path = computeRectUnionPath(rects, CORNER_RADIUS);
    if (path) {
      merged.push({ color, path });
    }
  }

  return merged;
}

export function computeSingleWallPath(
  wall: Pick<WallSegment, "start" | "end">,
): string | null {
  return computeRectUnionPath([getWallRenderRect(wall)], 0);
}

function getWallRenderRect(wall: Pick<WallSegment, "start" | "end">): Rect {
  if (wall.start.x === wall.end.x && wall.start.y === wall.end.y) {
    return {
      x: wall.start.x - GRID_SIZE / 2,
      y: wall.start.y - GRID_SIZE / 2,
      width: GRID_SIZE,
      height: GRID_SIZE,
    };
  }

  const half = WALL_THICKNESS / 2;

  if (wall.start.y === wall.end.y) {
    const minX = Math.min(wall.start.x, wall.end.x);
    const length = Math.abs(wall.end.x - wall.start.x);

    return {
      x: minX - half,
      y: wall.start.y - half,
      width: length + WALL_THICKNESS,
      height: WALL_THICKNESS,
    };
  }

  const minY = Math.min(wall.start.y, wall.end.y);
  const length = Math.abs(wall.end.y - wall.start.y);

  return {
    x: wall.start.x - half,
    y: minY - half,
    width: WALL_THICKNESS,
    height: length + WALL_THICKNESS,
  };
}

function computeRectUnionPath(
  rects: Array<Rect>,
  cornerRadius: number,
): string | null {
  if (rects.length === 0) {
    return null;
  }

  const xsSet = new Set<number>();
  const ysSet = new Set<number>();

  for (const rect of rects) {
    xsSet.add(rect.x);
    xsSet.add(rect.x + rect.width);
    ysSet.add(rect.y);
    ysSet.add(rect.y + rect.height);
  }

  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);

  const numCols = xs.length - 1;
  const numRows = ys.length - 1;

  if (numCols <= 0 || numRows <= 0) {
    return null;
  }

  const grid: Array<Array<boolean>> = [];

  for (let row = 0; row < numRows; row++) {
    const currentRow: Array<boolean> = [];

    for (let col = 0; col < numCols; col++) {
      const cx = (xs[col] + xs[col + 1]) / 2;
      const cy = (ys[row] + ys[row + 1]) / 2;

      currentRow.push(
        rects.some(
          (rect) =>
            cx >= rect.x &&
            cx <= rect.x + rect.width &&
            cy >= rect.y &&
            cy <= rect.y + rect.height,
        ),
      );
    }

    grid.push(currentRow);
  }

  const edges: Array<DirectedEdge> = [];

  for (let row = 0; row <= numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const above = row > 0 ? grid[row - 1][col] : false;
      const below = row < numRows ? grid[row][col] : false;

      if (above === below) {
        continue;
      }

      if (below) {
        edges.push({
          from: { x: xs[col], y: ys[row] },
          to: { x: xs[col + 1], y: ys[row] },
        });
      } else {
        edges.push({
          from: { x: xs[col + 1], y: ys[row] },
          to: { x: xs[col], y: ys[row] },
        });
      }
    }
  }

  for (let col = 0; col <= numCols; col++) {
    for (let row = 0; row < numRows; row++) {
      const left = col > 0 ? grid[row][col - 1] : false;
      const right = col < numCols ? grid[row][col] : false;

      if (left === right) {
        continue;
      }

      if (right) {
        edges.push({
          from: { x: xs[col], y: ys[row + 1] },
          to: { x: xs[col], y: ys[row] },
        });
      } else {
        edges.push({
          from: { x: xs[col], y: ys[row] },
          to: { x: xs[col], y: ys[row + 1] },
        });
      }
    }
  }

  if (edges.length === 0) {
    return null;
  }

  const contours = chainEdges(edges);
  if (contours.length === 0) {
    return null;
  }

  const paths: Array<string> = [];

  for (const contour of contours) {
    const simplified = simplifyContour(contour);
    if (simplified.length >= 3) {
      paths.push(contourToSVGPath(simplified, cornerRadius));
    }
  }

  return paths.length > 0 ? paths.join(" ") : null;
}

const pointKey = (point: Position): string => `${point.x}:${point.y}`;

function dirIndex(dx: number, dy: number): number {
  if (dx > 0) {
    return 0;
  }

  if (dy > 0) {
    return 1;
  }

  if (dx < 0) {
    return 2;
  }

  return 3;
}

const TURN_PRIORITY = [1, 0, 3, 2];

function turnRank(inDirection: number, outDirection: number): number {
  const turn = (outDirection - inDirection + 4) % 4;
  return TURN_PRIORITY.indexOf(turn);
}

function chainEdges(edges: Array<DirectedEdge>): Array<Array<Position>> {
  const edgesByFrom = new Map<string, Array<number>>();

  for (let index = 0; index < edges.length; index++) {
    const key = pointKey(edges[index].from);
    const existing = edgesByFrom.get(key);

    if (existing) {
      existing.push(index);
    } else {
      edgesByFrom.set(key, [index]);
    }
  }

  const used = new Set<number>();
  const contours: Array<Array<Position>> = [];

  for (let start = 0; start < edges.length; start++) {
    if (used.has(start)) {
      continue;
    }

    const contour: Array<Position> = [];
    let currentEdgeIndex = start;
    let previousEdge: DirectedEdge | null = null;

    while (!used.has(currentEdgeIndex)) {
      used.add(currentEdgeIndex);

      const edge = edges[currentEdgeIndex];
      contour.push(edge.from);
      previousEdge = edge;

      const nextKey = pointKey(edge.to);
      const candidates = edgesByFrom.get(nextKey);

      if (!candidates) {
        break;
      }

      const available = candidates.filter((candidate) => !used.has(candidate));

      if (available.length === 0) {
        break;
      }

      if (available.length === 1) {
        currentEdgeIndex = available[0];
        continue;
      }

      const inDirection = dirIndex(
        previousEdge.to.x - previousEdge.from.x,
        previousEdge.to.y - previousEdge.from.y,
      );

      available.sort((a, b) => {
        const edgeA = edges[a];
        const edgeB = edges[b];

        const directionA = dirIndex(
          edgeA.to.x - edgeA.from.x,
          edgeA.to.y - edgeA.from.y,
        );
        const directionB = dirIndex(
          edgeB.to.x - edgeB.from.x,
          edgeB.to.y - edgeB.from.y,
        );

        return (
          turnRank(inDirection, directionA) - turnRank(inDirection, directionB)
        );
      });

      currentEdgeIndex = available[0];
    }

    if (contour.length >= 3) {
      contours.push(contour);
    }
  }

  return contours;
}

function simplifyContour(contour: Array<Position>): Array<Position> {
  const size = contour.length;

  if (size <= 4) {
    return contour;
  }

  const simplified: Array<Position> = [];

  for (let index = 0; index < size; index++) {
    const previous = contour[(index - 1 + size) % size];
    const current = contour[index];
    const next = contour[(index + 1) % size];

    const collinearHorizontal =
      previous.y === current.y && current.y === next.y;
    const collinearVertical = previous.x === current.x && current.x === next.x;

    if (!collinearHorizontal && !collinearVertical) {
      simplified.push(current);
    }
  }

  return simplified;
}

function contourToSVGPath(
  contour: Array<Position>,
  cornerRadius: number,
): string {
  const size = contour.length;
  const parts: Array<string> = [];

  for (let index = 0; index < size; index++) {
    const previous = contour[(index - 1 + size) % size];
    const current = contour[index];
    const next = contour[(index + 1) % size];

    const inDx = current.x - previous.x;
    const inDy = current.y - previous.y;
    const outDx = next.x - current.x;
    const outDy = next.y - current.y;

    const inLength = Math.sqrt(inDx * inDx + inDy * inDy);
    const outLength = Math.sqrt(outDx * outDx + outDy * outDy);

    if (inLength === 0 || outLength === 0) {
      if (index === 0) {
        parts.push(`M ${current.x} ${current.y}`);
      } else {
        parts.push(`L ${current.x} ${current.y}`);
      }

      continue;
    }

    const inUx = inDx / inLength;
    const inUy = inDy / inLength;
    const outUx = outDx / outLength;
    const outUy = outDy / outLength;

    if (cornerRadius > 0) {
      const maxRadius = Math.min(inLength, outLength) / 2;
      const radius = Math.min(cornerRadius, maxRadius);

      const approachX = current.x - radius * inUx;
      const approachY = current.y - radius * inUy;
      const departX = current.x + radius * outUx;
      const departY = current.y + radius * outUy;

      if (index === 0) {
        parts.push(`M ${approachX} ${approachY}`);
      } else {
        parts.push(`L ${approachX} ${approachY}`);
      }

      parts.push(`Q ${current.x} ${current.y} ${departX} ${departY}`);
    } else if (index === 0) {
      parts.push(`M ${current.x} ${current.y}`);
    } else {
      parts.push(`L ${current.x} ${current.y}`);
    }
  }

  parts.push("Z");

  return parts.join(" ");
}
