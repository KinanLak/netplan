// Imported by convex/: relative imports only.
import type { Device } from "../types/map";
import type { DevicePatch } from "./types";

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
