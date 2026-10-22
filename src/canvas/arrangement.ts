import { GRID_SIZE } from "@/lib/grid";
import type { DeviceId, Position, Size } from "@/types/map";

export interface ArrangedDevice {
  id: DeviceId;
  position: Position;
  size: Size;
}

export interface PositionUpdate {
  deviceId: DeviceId;
  position: Position;
}

export type Alignment =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";

export type DistributionAxis = "horizontal" | "vertical";

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

/** Lines the devices up on the edge or centre of the group they form. */
export function alignDevices(
  devices: ReadonlyArray<ArrangedDevice>,
  alignment: Alignment,
): Array<PositionUpdate> {
  if (devices.length < 2) return [];
  const left = Math.min(...devices.map((d) => d.position.x));
  const right = Math.max(...devices.map((d) => d.position.x + d.size.width));
  const top = Math.min(...devices.map((d) => d.position.y));
  const bottom = Math.max(...devices.map((d) => d.position.y + d.size.height));
  const target = (device: ArrangedDevice): Position => {
    const { position: p, size: s } = device;
    switch (alignment) {
      case "left":
        return { x: left, y: p.y };
      case "right":
        return { x: snap(right - s.width), y: p.y };
      case "center-x":
        return { x: snap((left + right) / 2 - s.width / 2), y: p.y };
      case "top":
        return { x: p.x, y: top };
      case "bottom":
        return { x: p.x, y: snap(bottom - s.height) };
      case "center-y":
        return { x: p.x, y: snap((top + bottom) / 2 - s.height / 2) };
    }
  };
  return changedOnly(devices, target);
}

/**
 * Spreads the devices so the gaps between them are equal, the first and
 * last staying where they are. Needs three devices.
 */
export function distributeDevices(
  devices: ReadonlyArray<ArrangedDevice>,
  axis: DistributionAxis,
): Array<PositionUpdate> {
  if (devices.length < 3) return [];
  const key = axis === "horizontal" ? "x" : "y";
  const extent = axis === "horizontal" ? "width" : "height";
  const sorted = devices.toSorted((a, b) => a.position[key] - b.position[key]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last.position[key] + last.size[extent] - first.position[key];
  const occupied = sorted.reduce((sum, d) => sum + d.size[extent], 0);
  const gap = (span - occupied) / (sorted.length - 1);
  const starts = new Map<DeviceId, number>();
  let cursor = first.position[key];
  for (const device of sorted) {
    starts.set(device.id, cursor);
    cursor += device.size[extent] + gap;
  }
  return changedOnly(devices, (device) => {
    const start = starts.get(device.id) ?? device.position[key];
    const snapped = device === first || device === last ? start : snap(start);
    return { ...device.position, [key]: snapped };
  });
}

/** The moves of a nudge: every device by the same step. */
export function nudgeDevices(
  devices: ReadonlyArray<ArrangedDevice>,
  step: Position,
): Array<PositionUpdate> {
  return devices.map((device) => ({
    deviceId: device.id,
    position: {
      x: device.position.x + step.x,
      y: device.position.y + step.y,
    },
  }));
}

/**
 * The moves in an order the server can apply one by one: each device moves
 * once the devices standing where it goes have left. Moves in opposite
 * directions (spreading, centring) need it; a cycle keeps the rest as given.
 */
export function orderMoves(
  devices: ReadonlyArray<ArrangedDevice>,
  updates: ReadonlyArray<PositionUpdate>,
): Array<PositionUpdate> {
  const sizes = new Map(devices.map((device) => [device.id, device.size]));
  const current = new Map(
    devices.map((device) => [device.id, device.position]),
  );
  const rect = (id: ArrangedDevice["id"], position: Position) => ({
    ...position,
    ...(sizes.get(id) ?? { width: 0, height: 0 }),
  });
  const pending = [...updates];
  const ordered: Array<PositionUpdate> = [];
  while (pending.length > 0) {
    const index = pending.findIndex((update) => {
      const target = rect(update.deviceId, update.position);
      return pending.every(
        (other) =>
          other === update ||
          !overlaps(
            target,
            rect(other.deviceId, current.get(other.deviceId) ?? other.position),
          ),
      );
    });
    const [next] = pending.splice(index === -1 ? 0 : index, 1);
    current.set(next.deviceId, next.position);
    ordered.push(next);
  }
  return ordered;
}

type Rect = Position & Size;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** Whether two of the devices, once moved, would stand on each other. */
export function arrangedDevicesOverlap(
  devices: ReadonlyArray<ArrangedDevice>,
  updates: ReadonlyArray<PositionUpdate>,
): boolean {
  const moved = new Map(updates.map((u) => [u.deviceId, u.position]));
  const rects = devices.map((device) => ({
    ...(moved.get(device.id) ?? device.position),
    ...device.size,
  }));
  return rects.some((a, i) => rects.slice(i + 1).some((b) => overlaps(a, b)));
}

function changedOnly(
  devices: ReadonlyArray<ArrangedDevice>,
  target: (device: ArrangedDevice) => Position,
): Array<PositionUpdate> {
  return devices.flatMap((device) => {
    const position = target(device);
    return position.x === device.position.x && position.y === device.position.y
      ? []
      : [{ deviceId: device.id, position }];
  });
}
