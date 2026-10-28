// Imported by convex/: relative imports only.
import type { Position, Size } from "../types/map";

type Rect = Position & Size;

/** Why a group cannot move by an offset; the server says it in French. */
export type GroupMoveRefusal =
  | "device-collision"
  | "wall-collision"
  | "wall-crossing";

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** The open interval of `t` where `start + t * delta` lies in (min, max). */
const slab = (
  start: number,
  delta: number,
  min: number,
  max: number,
): [number, number] => {
  if (delta === 0) {
    return start > min && start < max
      ? [-Infinity, Infinity]
      : [Infinity, -Infinity];
  }
  const a = (min - start) / delta;
  const b = (max - start) / delta;
  return a < b ? [a, b] : [b, a];
};

/**
 * Whether `rect`, slid in a straight line by `offset`, touches `obstacle`
 * anywhere on its way, its end included. Touching edges do not count, as
 * for a device standing against a wall.
 */
export const sweepHitsRect = (
  rect: Rect,
  offset: Position,
  obstacle: Rect,
): boolean => {
  // The rectangle's corner must stay out of the obstacle grown by its size.
  const [loX, hiX] = slab(
    rect.x,
    offset.x,
    obstacle.x - rect.width,
    obstacle.x + obstacle.width,
  );
  const [loY, hiY] = slab(
    rect.y,
    offset.y,
    obstacle.y - rect.height,
    obstacle.y + obstacle.height,
  );
  const lo = Math.max(loX, loY);
  const hi = Math.min(hiX, hiY);
  return lo < hi && lo < 1 && hi > 0;
};

/**
 * Whether the group may move by `offset` as one rigid block (ADR 0034):
 * every member lands on free ground, and none passes through a wall on the
 * way. Other devices may be passed over, as a single drag does.
 */
export const groupMoveRefusal = (
  members: ReadonlyArray<Rect>,
  offset: Position,
  obstacles: {
    devices: ReadonlyArray<Rect>;
    walls: ReadonlyArray<Rect>;
  },
): GroupMoveRefusal | null => {
  const moved = members.map((member) => ({
    ...member,
    x: member.x + offset.x,
    y: member.y + offset.y,
  }));
  if (
    moved.some((member) => obstacles.devices.some((d) => overlaps(member, d)))
  )
    return "device-collision";
  if (moved.some((member) => obstacles.walls.some((w) => overlaps(member, w))))
    return "wall-collision";
  if (
    members.some((member) =>
      obstacles.walls.some((wall) => sweepHitsRect(member, offset, wall)),
    )
  )
    return "wall-crossing";
  return null;
};
