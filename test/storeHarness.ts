import { act } from "@testing-library/react";
import type { Device, DeviceId, FloorId, MapStore } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";

export type MapStoreSeed = Partial<
  Pick<
    MapStore,
    | "currentBuildingId"
    | "currentFloorId"
    | "selectedDeviceId"
    | "selectedDeviceIds"
    | "selectedDeviceIdSet"
    | "hoveredDeviceId"
    | "isEditMode"
    | "isMultiSelectMode"
    | "highlightedDeviceIds"
    | "highlightedDeviceIdSet"
    | "activeDrawTool"
    | "selectedWallColor"
    | "wallEraserSize"
  >
>;

export const seedMapStore = (seed: MapStoreSeed) => {
  // Wrap in act() so seeding while a subscribed component is mounted flushes
  // the resulting React update instead of tripping the act(...) warning.
  act(() => {
    useMapStore.setState(seed);
  });
};

export const buildDevice = (overrides: Partial<Device> = {}): Device => ({
  id: "device-1" as DeviceId,
  type: "pc",
  name: "PC 1",
  hostname: "host-1",
  floorId: "floor-1" as FloorId,
  position: { x: 0, y: 0 },
  size: { width: 80, height: 80 },
  metadata: {},
  ...overrides,
});
