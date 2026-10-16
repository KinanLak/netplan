import type { DeviceType, Size } from "../types/map";

/** The size a device of each type takes when it is placed without one. */
export const DEFAULT_DEVICE_SIZES = {
  rack: { width: 80, height: 160 },
  switch: { width: 200, height: 60 },
  pc: { width: 80, height: 80 },
  "wall-port": { width: 40, height: 40 },
  "patch-panel": { width: 200, height: 40 },
  endpoint: { width: 80, height: 80 },
} satisfies Record<DeviceType, Size>;
