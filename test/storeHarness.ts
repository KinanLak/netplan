import type { Device, MapStore } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";

export type MapStoreSeed = Partial<
  Pick<
    MapStore,
    | "devices"
    | "walls"
    | "currentBuildingId"
    | "currentFloorId"
    | "selectedDeviceId"
    | "hoveredDeviceId"
    | "isEditMode"
    | "highlightedDeviceIds"
    | "highlightedDeviceIdSet"
    | "activeDrawTool"
    | "selectedWallColor"
  >
>;

export const seedMapStore = (seed: MapStoreSeed) => {
  useMapStore.setState(seed);
};

export const buildDevice = (overrides: Partial<Device> = {}): Device => ({
  id: "device-1",
  type: "pc",
  name: "PC 1",
  hostname: "host-1",
  floorId: "floor-1",
  position: { x: 0, y: 0 },
  size: { width: 80, height: 80 },
  metadata: {},
  ...overrides,
});
