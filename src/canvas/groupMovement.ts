import type { Device, DeviceId, Position } from "@/types/map";

export interface DevicePositionUpdate {
  deviceId: DeviceId;
  position: Position;
}

export function sortGroupPositionUpdates(
  devices: ReadonlyArray<Device>,
  updates: Array<DevicePositionUpdate>,
): Array<DevicePositionUpdate> {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const first = updates.find((update) => deviceById.has(update.deviceId));
  const firstDevice = first ? deviceById.get(first.deviceId) : undefined;
  if (!first || !firstDevice) return updates;
  const deltaX = first.position.x - firstDevice.position.x;
  const deltaY = first.position.y - firstDevice.position.y;

  return updates.toSorted((left, right) => {
    const leftDevice = deviceById.get(left.deviceId);
    const rightDevice = deviceById.get(right.deviceId);
    if (!leftDevice || !rightDevice) return 0;
    const leftProjection =
      leftDevice.position.x * deltaX + leftDevice.position.y * deltaY;
    const rightProjection =
      rightDevice.position.x * deltaX + rightDevice.position.y * deltaY;
    return rightProjection - leftProjection;
  });
}
