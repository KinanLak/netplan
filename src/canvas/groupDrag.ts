import { CANVAS_DEVICE_NEAREST_POSITION_MAX_RADIUS } from "@/lib/constants";
import { GRID_SIZE } from "@/lib/grid";
import type { Position } from "@/types/map";

/**
 * One drag of a selection of several devices. The group takes one offset
 * for all its members, so it never deforms (ADR 0034).
 */
export interface GroupDrag {
  /** The offset the group takes when the cursor asks for `requested`. */
  resolve: (requested: Position) => Position;
  /** Where the group stands now, relative to where the drag started. */
  offset: () => Position;
}

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

/** Grid offsets around the origin, nearest first, out to `radius`. */
const offsetsAround = (radius: number): ReadonlyArray<Position> => {
  const steps = Math.floor(radius / GRID_SIZE);
  const offsets: Array<Position> = [];
  for (let dx = -steps; dx <= steps; dx += 1) {
    for (let dy = -steps; dy <= steps; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      if (dx * dx + dy * dy > steps * steps) continue;
      offsets.push({ x: dx * GRID_SIZE, y: dy * GRID_SIZE });
    }
  }
  return offsets.toSorted(
    (a, b) =>
      a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y) ||
      Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)),
  );
};

let nearestOffsets: ReadonlyArray<Position> | null = null;

/**
 * Starts a group drag. `isFree` says whether the whole group may stand at an
 * offset; under a refused cursor the group waits at the nearest offset that
 * is, as a single device does (A13), or where it last stood.
 */
export function createGroupDrag(
  isFree: (offset: Position) => boolean,
): GroupDrag {
  nearestOffsets ??= offsetsAround(CANVAS_DEVICE_NEAREST_POSITION_MAX_RADIUS);
  let lastRequested = "0,0";
  let current: Position = { x: 0, y: 0 };

  const nearestFree = (wanted: Position): Position | null => {
    if (isFree(wanted)) return wanted;
    for (const around of nearestOffsets ?? []) {
      const candidate = { x: wanted.x + around.x, y: wanted.y + around.y };
      if (isFree(candidate)) return candidate;
    }
    return null;
  };

  return {
    resolve: (requested) => {
      const wanted = { x: snap(requested.x), y: snap(requested.y) };
      const key = `${wanted.x},${wanted.y}`;
      if (key === lastRequested) return current;
      lastRequested = key;
      current = nearestFree(wanted) ?? current;
      return current;
    },
    offset: () => current,
  };
}
