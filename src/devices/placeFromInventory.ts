import { getDeviceKind } from "./deviceKindRegistry";
import type { DevicePlacement } from "./devicePlacement";
import { asDeviceId } from "@/lib/objectIds";
import type { Device, FloorId, Position } from "@/types/map";

/** An inventory device, before it stands anywhere. */
export type UnplacedDevice = Omit<Device, "floorId" | "position" | "size">;

/**
 * The device an inventory row stands for, its identity fields only: the
 * row also carries what the list shows (`location`, `seenAt`), which the
 * map operation's validator refuses.
 */
export const unplacedDeviceOf = (row: {
  id: string;
  type: Device["type"];
  name: string;
  hostname?: string;
  serial?: string;
  macs: Array<string>;
  model?: string;
  ip?: string;
  notes?: string;
  source?: Device["source"];
  metadata: Device["metadata"];
}): UnplacedDevice => ({
  id: asDeviceId(row.id),
  type: row.type,
  name: row.name,
  macs: row.macs,
  metadata: row.metadata,
  ...(row.hostname !== undefined && { hostname: row.hostname }),
  ...(row.serial !== undefined && { serial: row.serial }),
  ...(row.model !== undefined && { model: row.model }),
  ...(row.ip !== undefined && { ip: row.ip }),
  ...(row.notes !== undefined && { notes: row.notes }),
  ...(row.source !== undefined && { source: row.source }),
});

/** The flow coordinates at the middle of the visible canvas. */
export const viewportCentre = ({
  width,
  height,
  transform: [x, y, zoom],
}: {
  width: number;
  height: number;
  transform: [number, number, number];
}): Position => ({
  x: (width / 2 - x) / zoom,
  y: (height / 2 - y) / zoom,
});

/**
 * The device at its type's default size, centred on `centre` or at the
 * nearest free spot around it; `null` when there is none in reach.
 */
export const placeAround = (
  device: UnplacedDevice,
  floorId: FloorId,
  centre: Position,
  placement: DevicePlacement,
): Device | null => {
  const size = getDeviceKind(device.type).defaultSize;
  const result = placement.resolve({
    kind: "add",
    floorId,
    requestedPosition: {
      x: centre.x - size.width / 2,
      y: centre.y - size.height / 2,
    },
    size,
  });
  if (!result.ok) return null;
  return { ...device, floorId, position: result.position, size };
};
