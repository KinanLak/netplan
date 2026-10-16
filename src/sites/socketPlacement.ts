// Where the LibreNMS cycle puts a device seen at a wall socket (ADR 0022).
import { createDevicePlacement } from "../devices/devicePlacement";
import { rectanglesOverlap } from "../lib/geometry";
import type { FloorId, Position, Size } from "../types/map";

type Box = { position: Position; size: Size };
type Rect = { x: number; y: number; width: number; height: number };

const centreOf = ({ position, size }: Box): Position => ({
  x: position.x + size.width / 2,
  y: position.y + size.height / 2,
});

/**
 * Whether the segment runs through the rectangle; one parallel to an axis
 * counts its edges.
 */
export function crossesRect(from: Position, to: Position, rect: Rect): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let enter = 0;
  let exit = 1;
  for (const [delta, low, high] of [
    [dx, rect.x - from.x, rect.x + rect.width - from.x],
    [dy, rect.y - from.y, rect.y + rect.height - from.y],
  ]) {
    if (delta === 0) {
      // Walls are rows of grid cells: a segment along the seam between two
      // goes through the wall although it enters neither.
      if (low > 0 || high < 0) return false;
      continue;
    }
    const [near, far] =
      delta > 0 ? [low / delta, high / delta] : [high / delta, low / delta];
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
  }
  return enter < exit;
}

/**
 * The free spot nearest to a socket for a device of this size: clear of the
 * floor's devices and walls, and on the socket's side of every wall, so that
 * a device is never put in the next room. `null` when there is none in reach.
 */
export function spotNextToSocket({
  floorId,
  socket,
  size,
  others,
  walls,
}: {
  floorId: FloorId;
  socket: Box;
  size: Size;
  others: ReadonlyArray<Box>;
  walls: ReadonlyArray<Rect>;
}): Position | null {
  const from = centreOf(socket);
  // A socket drawn over a wall is on both its sides.
  const barriers = walls.filter(
    (wall) =>
      !(
        from.x > wall.x &&
        from.x < wall.x + wall.width &&
        from.y > wall.y &&
        from.y < wall.y + wall.height
      ),
  );
  const blocked = (position: Position) =>
    others.some((other) =>
      rectanglesOverlap(position, size, other.position, other.size),
    ) ||
    walls.some((wall) =>
      rectanglesOverlap(
        position,
        size,
        { x: wall.x, y: wall.y },
        { width: wall.width, height: wall.height },
      ),
    ) ||
    barriers.some((wall) =>
      crossesRect(from, centreOf({ position, size }), wall),
    );
  const spot = createDevicePlacement({
    checkCollision: (_floorId, _deviceId, position) => blocked(position),
  }).resolve({
    kind: "add",
    floorId,
    requestedPosition: {
      x: from.x - size.width / 2,
      y: from.y - size.height / 2,
    },
    size,
  });
  return spot.ok ? spot.position : null;
}
