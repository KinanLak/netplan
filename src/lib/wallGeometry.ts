/**
 * Wall geometry engine — computes the merged SVG outline of axis-aligned wall
 * rectangles, grouped by color. Produces a single `<path>` per color group
 * with:
 *   • A unified fill (no internal borders)
 *   • An exterior-only stroke
 *   • Rounded corners via quadratic Bezier curves
 *
 * Algorithm overview:
 *   1. Extend each wall rect by WALL_THICKNESS/2 on each end (caps)
 *   2. Collect unique X/Y grid coordinates from all rects
 *   3. Build a boolean grid: each cell is "filled" if covered by any rect
 *   4. Trace boundary edges with CW winding (filled on RIGHT)
 *   5. Chain edges into closed contours, simplify collinear vertices
 *   6. Generate SVG path with rounded corners
 */

import { WALL_THICKNESS } from "./walls";
import type { Position, WallColor, WallSegment } from "@/types/map";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MergedWallGroup {
  color: WallColor;
  /** SVG path `d` attribute — may contain multiple M…Z sub-paths */
  path: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Radius applied to all contour corners */
const CORNER_RADIUS = 10;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Groups walls by color and computes one merged SVG path per group.
 * Each wall rect is extended by half-thickness on each end so that
 * adjacent walls overlap at their junction — the union naturally produces
 * clean outlines without explicit junction squares.
 */
export function computeMergedWallGroups(
  walls: ReadonlyArray<Pick<WallSegment, "start" | "end" | "color">>,
): Array<MergedWallGroup> {
  // Group walls by color
  const groups = new Map<
    WallColor,
    Array<Pick<WallSegment, "start" | "end" | "color">>
  >();

  for (const wall of walls) {
    let group = groups.get(wall.color);
    if (!group) {
      group = [];
      groups.set(wall.color, group);
    }
    group.push(wall);
  }

  const result: Array<MergedWallGroup> = [];

  for (const [color, colorWalls] of groups) {
    const rects = colorWalls.map(getExtendedWallRect);
    const path = computeRectUnionPath(rects, CORNER_RADIUS);
    if (path) {
      result.push({ color, path });
    }
  }

  return result;
}

/**
 * Computes the merged SVG path for a single wall segment using the same
 * extended-cap and rounded-corner geometry as grouped wall rendering.
 */
export function computeSingleWallPath(
  wall: Pick<WallSegment, "start" | "end">,
): string | null {
  return computeRectUnionPath([getExtendedWallRect(wall)], CORNER_RADIUS);
}

// ---------------------------------------------------------------------------
// Wall → extended rect
// ---------------------------------------------------------------------------

/**
 * Converts a wall segment to its rendering rectangle, extended by
 * `WALL_THICKNESS / 2` on each end along the wall's axis. This creates
 * a small cap at free ends and ensures overlapping coverage at junctions.
 */
function getExtendedWallRect(wall: Pick<WallSegment, "start" | "end">): Rect {
  const half = WALL_THICKNESS / 2;

  if (wall.start.y === wall.end.y) {
    // Horizontal
    const minX = Math.min(wall.start.x, wall.end.x);
    const length = Math.abs(wall.end.x - wall.start.x);
    return {
      x: minX - half,
      y: wall.start.y - half,
      width: length + WALL_THICKNESS,
      height: WALL_THICKNESS,
    };
  }

  // Vertical
  const minY = Math.min(wall.start.y, wall.end.y);
  const length = Math.abs(wall.end.y - wall.start.y);
  return {
    x: wall.start.x - half,
    y: minY - half,
    width: WALL_THICKNESS,
    height: length + WALL_THICKNESS,
  };
}

// ---------------------------------------------------------------------------
// Rectangle union → SVG path
// ---------------------------------------------------------------------------

function computeRectUnionPath(
  rects: Array<Rect>,
  cornerRadius: number,
): string | null {
  if (rects.length === 0) return null;

  // 1. Collect unique X and Y coordinates
  const xsSet = new Set<number>();
  const ysSet = new Set<number>();

  for (const r of rects) {
    xsSet.add(r.x);
    xsSet.add(r.x + r.width);
    ysSet.add(r.y);
    ysSet.add(r.y + r.height);
  }

  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);

  const numCols = xs.length - 1;
  const numRows = ys.length - 1;
  if (numCols <= 0 || numRows <= 0) return null;

  // 2. Build boolean grid — cell (col i, row j) is filled if its center
  //    lies inside any input rect.
  const grid: Array<Array<boolean>> = [];
  for (let j = 0; j < numRows; j++) {
    const row: Array<boolean> = [];
    for (let i = 0; i < numCols; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      row.push(
        rects.some(
          (r) =>
            cx >= r.x &&
            cx <= r.x + r.width &&
            cy >= r.y &&
            cy <= r.y + r.height,
        ),
      );
    }
    grid.push(row);
  }

  // 3. Collect directed boundary edges.
  //    Convention: the filled region is on the RIGHT side of the directed
  //    edge (in screen coordinates with y-down). This produces CW outer
  //    contours and CCW hole contours.
  const edges: Array<DirectedEdge> = [];

  // Horizontal edges — at each y = ys[j], scan columns
  for (let j = 0; j <= numRows; j++) {
    for (let i = 0; i < numCols; i++) {
      const above = j > 0 ? grid[j - 1][i] : false;
      const below = j < numRows ? grid[j][i] : false;
      if (above === below) continue;

      if (below) {
        // Filled below → edge left-to-right
        edges.push({
          from: { x: xs[i], y: ys[j] },
          to: { x: xs[i + 1], y: ys[j] },
        });
      } else {
        // Filled above → edge right-to-left
        edges.push({
          from: { x: xs[i + 1], y: ys[j] },
          to: { x: xs[i], y: ys[j] },
        });
      }
    }
  }

  // Vertical edges — at each x = xs[i], scan rows
  for (let i = 0; i <= numCols; i++) {
    for (let j = 0; j < numRows; j++) {
      const left = i > 0 ? grid[j][i - 1] : false;
      const right = i < numCols ? grid[j][i] : false;
      if (left === right) continue;

      if (right) {
        // Filled right → edge bottom-to-top
        edges.push({
          from: { x: xs[i], y: ys[j + 1] },
          to: { x: xs[i], y: ys[j] },
        });
      } else {
        // Filled left → edge top-to-bottom
        edges.push({
          from: { x: xs[i], y: ys[j] },
          to: { x: xs[i], y: ys[j + 1] },
        });
      }
    }
  }

  if (edges.length === 0) return null;

  // 4. Chain edges into closed contours
  const contours = chainEdges(edges);

  if (contours.length === 0) return null;

  // 5. Simplify (remove collinear vertices) and generate SVG paths
  const pathParts: Array<string> = [];
  for (const raw of contours) {
    const simplified = simplifyContour(raw);
    if (simplified.length >= 3) {
      pathParts.push(contourToSVGPath(simplified, cornerRadius));
    }
  }

  return pathParts.length > 0 ? pathParts.join(" ") : null;
}

// ---------------------------------------------------------------------------
// Edge chaining
// ---------------------------------------------------------------------------

const pointKey = (p: Position): string => `${p.x}:${p.y}`;

/**
 * Encode the direction of a vector as 0=right, 1=down, 2=left, 3=up.
 */
function dirIndex(dx: number, dy: number): number {
  if (dx > 0) return 0;
  if (dy > 0) return 1;
  if (dx < 0) return 2;
  return 3; // dy < 0
}

/**
 * CW turn-priority: at an ambiguous vertex (checkerboard), prefer the
 * rightmost turn to keep the filled region on our right.
 * Priority order: right(1) > straight(0) > left(3) > u-turn(2).
 */
const TURN_PRIORITY = [1, 0, 3, 2]; // index = rank (lower is better)

function turnRank(inDir: number, outDir: number): number {
  const turn = (outDir - inDir + 4) % 4;
  return TURN_PRIORITY.indexOf(turn);
}

function chainEdges(edges: Array<DirectedEdge>): Array<Array<Position>> {
  // Index edges by their starting vertex
  const edgesByFrom = new Map<string, Array<number>>();
  for (let idx = 0; idx < edges.length; idx++) {
    const key = pointKey(edges[idx].from);
    let list = edgesByFrom.get(key);
    if (!list) {
      list = [];
      edgesByFrom.set(key, list);
    }
    list.push(idx);
  }

  const used = new Set<number>();
  const contours: Array<Array<Position>> = [];

  for (let startIdx = 0; startIdx < edges.length; startIdx++) {
    if (used.has(startIdx)) continue;

    const contour: Array<Position> = [];
    let currentIdx = startIdx;
    let prevEdge: DirectedEdge | null = null;

    while (!used.has(currentIdx)) {
      used.add(currentIdx);
      const edge = edges[currentIdx];
      contour.push(edge.from);
      prevEdge = edge;

      // Find next edge
      const nextKey = pointKey(edge.to);
      const candidates = edgesByFrom.get(nextKey);
      if (!candidates) break;

      // Filter to unused candidates
      const available = candidates.filter((idx) => !used.has(idx));
      if (available.length === 0) break;

      if (available.length === 1) {
        currentIdx = available[0];
      } else {
        // Ambiguous vertex — pick rightmost CW turn
        const inDir = dirIndex(
          prevEdge.to.x - prevEdge.from.x,
          prevEdge.to.y - prevEdge.from.y,
        );
        available.sort((a, b) => {
          const ea = edges[a];
          const eb = edges[b];
          const dirA = dirIndex(ea.to.x - ea.from.x, ea.to.y - ea.from.y);
          const dirB = dirIndex(eb.to.x - eb.from.x, eb.to.y - eb.from.y);
          return turnRank(inDir, dirA) - turnRank(inDir, dirB);
        });
        currentIdx = available[0];
      }
    }

    if (contour.length >= 3) {
      contours.push(contour);
    }
  }

  return contours;
}

// ---------------------------------------------------------------------------
// Contour simplification
// ---------------------------------------------------------------------------

/**
 * Removes collinear vertices from a closed rectilinear contour.
 * A vertex is collinear if all three of (prev, curr, next) share the
 * same X or the same Y coordinate.
 */
function simplifyContour(contour: Array<Position>): Array<Position> {
  const n = contour.length;
  if (n <= 4) return contour;

  const simplified: Array<Position> = [];

  for (let i = 0; i < n; i++) {
    const prev = contour[(i - 1 + n) % n];
    const curr = contour[i];
    const next = contour[(i + 1) % n];

    const collinearH = prev.y === curr.y && curr.y === next.y;
    const collinearV = prev.x === curr.x && curr.x === next.x;

    if (!collinearH && !collinearV) {
      simplified.push(curr);
    }
  }

  return simplified;
}

// ---------------------------------------------------------------------------
// SVG path generation
// ---------------------------------------------------------------------------

/**
 * Generates an SVG path `d` string from a simplified closed contour.
 *
 * Every corner is rounded with a quadratic Bezier curve.
 */
function contourToSVGPath(
  contour: Array<Position>,
  cornerRadius: number,
): string {
  const n = contour.length;
  const parts: Array<string> = [];

  for (let i = 0; i < n; i++) {
    const prev = contour[(i - 1 + n) % n];
    const curr = contour[i];
    const next = contour[(i + 1) % n];

    const inDx = curr.x - prev.x;
    const inDy = curr.y - prev.y;
    const outDx = next.x - curr.x;
    const outDy = next.y - curr.y;

    const inLen = Math.sqrt(inDx * inDx + inDy * inDy);
    const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

    // Guard against degenerate edges (should not happen after simplification)
    if (inLen === 0 || outLen === 0) {
      if (i === 0) {
        parts.push(`M ${curr.x} ${curr.y}`);
      } else {
        parts.push(`L ${curr.x} ${curr.y}`);
      }
      continue;
    }

    const inUx = inDx / inLen;
    const inUy = inDy / inLen;
    const outUx = outDx / outLen;
    const outUy = outDy / outLen;

    if (cornerRadius > 0) {
      // Clamp radius so adjacent rounded corners cannot overlap
      const maxR = Math.min(inLen, outLen) / 2;
      const r = Math.min(cornerRadius, maxR);

      // Approach point: step back along incoming edge
      const approachX = curr.x - r * inUx;
      const approachY = curr.y - r * inUy;

      // Departure point: step forward along outgoing edge
      const departX = curr.x + r * outUx;
      const departY = curr.y + r * outUy;

      if (i === 0) {
        parts.push(`M ${approachX} ${approachY}`);
      } else {
        parts.push(`L ${approachX} ${approachY}`);
      }
      // Quadratic Bézier: control point is the original corner
      parts.push(`Q ${curr.x} ${curr.y} ${departX} ${departY}`);
    } else {
      if (i === 0) {
        parts.push(`M ${curr.x} ${curr.y}`);
      } else {
        parts.push(`L ${curr.x} ${curr.y}`);
      }
    }
  }

  parts.push("Z");
  return parts.join(" ");
}
