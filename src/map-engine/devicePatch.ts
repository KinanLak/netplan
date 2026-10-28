// Imported by convex/: relative imports only.
import type { Device, Position } from "../types/map";
import type { DevicePatch, GroupMember } from "./types";

/** Whether a device still stands as `expected` says. */
export const isAsExpected = (
  device: Pick<Device, "position" | "size">,
  expected: DevicePatch,
): boolean =>
  (expected.position === undefined ||
    (device.position.x === expected.position.x &&
      device.position.y === expected.position.y)) &&
  (expected.size === undefined ||
    (device.size.width === expected.size.width &&
      device.size.height === expected.size.height));

/** Whether every device the list names stands where it says. */
export const movedAsExpected = (
  devices: ReadonlyArray<{ id: string; position: Position }>,
  expected: ReadonlyArray<{ deviceId: string; position: Position }>,
): boolean =>
  expected.every(({ deviceId, position }) =>
    devices.some(
      (device) =>
        device.id === deviceId &&
        device.position.x === position.x &&
        device.position.y === position.y,
    ),
  );

/** The members where a move by `offset` leaves them. */
export const shifted = (
  members: ReadonlyArray<GroupMember>,
  offset: Position,
): Array<GroupMember> =>
  members.map(({ deviceId, position }) => ({
    deviceId,
    position: { x: position.x + offset.x, y: position.y + offset.y },
  }));
