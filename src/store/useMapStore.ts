import { create } from "zustand";
import type { BuildingId, DeviceId, FloorId, MapStore } from "@/types/map";
import { WALL_ERASER_DEFAULT_SIZE, clampWallEraserSize } from "@/lib/constants";

const EMPTY_HIGHLIGHT_SET: ReadonlySet<DeviceId> = new Set<DeviceId>();
const toHighlightedDeviceIdSet = (
  deviceIds: ReadonlyArray<DeviceId>,
): ReadonlySet<DeviceId> => {
  return deviceIds.length === 0 ? EMPTY_HIGHLIGHT_SET : new Set(deviceIds);
};

export const useMapStore = create<MapStore>()((set) => ({
  currentBuildingId: null,
  currentFloorId: null,
  selectedDeviceId: null,
  selectedDeviceIds: [],
  selectedDeviceIdSet: new Set(),
  hoveredDeviceId: null,
  isEditMode: true,
  isMultiSelectMode: false,
  highlightedDeviceIds: [],
  highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
  activeDrawTool: "device",
  selectedWallColor: "concrete",
  wallEraserSize: WALL_ERASER_DEFAULT_SIZE,

  setCurrentBuilding: (buildingId: BuildingId | null) => {
    set({
      currentBuildingId: buildingId,
      currentFloorId: null,
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
      hoveredDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
    });
  },
  setCurrentFloor: (floorId: FloorId | null) => {
    set({
      currentFloorId: floorId,
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
      hoveredDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
    });
  },
  selectDevice: (deviceId) => {
    set((state) =>
      state.selectedDeviceId === deviceId
        ? state
        : {
            selectedDeviceId: deviceId,
            selectedDeviceIds: deviceId ? [deviceId] : [],
            selectedDeviceIdSet: deviceId ? new Set([deviceId]) : new Set(),
          },
    );
  },
  setSelectedDevices: (deviceIds) => {
    const uniqueIds = [...new Set(deviceIds)];
    set((state) => {
      const isSameSelection =
        state.selectedDeviceIds.length === uniqueIds.length &&
        state.selectedDeviceIds.every((id, index) => id === uniqueIds[index]);
      if (isSameSelection) return state;
      return {
        selectedDeviceId: uniqueIds.length === 1 ? uniqueIds[0] : null,
        selectedDeviceIds: uniqueIds,
        selectedDeviceIdSet: new Set(uniqueIds),
      };
    });
  },
  setHoveredDevice: (deviceId) => {
    set((state) =>
      state.hoveredDeviceId === deviceId
        ? state
        : { hoveredDeviceId: deviceId },
    );
  },
  toggleEditMode: () => {
    set((state) => {
      const selection = state.isMultiSelectMode
        ? {
            selectedDeviceId: null,
            selectedDeviceIds: [],
            selectedDeviceIdSet: new Set<DeviceId>(),
          }
        : {};
      return {
        isEditMode: !state.isEditMode,
        isMultiSelectMode: false,
        activeDrawTool: state.isEditMode ? "device" : state.activeDrawTool,
        ...selection,
      };
    });
  },
  toggleMultiSelectMode: () => {
    set((state) => ({
      isMultiSelectMode: !state.isMultiSelectMode,
      activeDrawTool: "device",
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
    }));
  },
  setActiveDrawTool: (tool) => {
    set({ activeDrawTool: tool });
  },
  setSelectedWallColor: (color) => {
    set({ selectedWallColor: color });
  },
  setWallEraserSize: (size) => {
    set((state) => {
      const nextSize = clampWallEraserSize(size);
      return state.wallEraserSize === nextSize
        ? state
        : { wallEraserSize: nextSize };
    });
  },
  setHighlightedDevices: (deviceIds) => {
    set((state) => {
      const isSameHighlightState =
        state.highlightedDeviceIds.length === deviceIds.length &&
        state.highlightedDeviceIds.every(
          (id, index) => id === deviceIds[index],
        );
      if (isSameHighlightState) {
        return state;
      }
      return {
        highlightedDeviceIds: deviceIds,
        highlightedDeviceIdSet: toHighlightedDeviceIdSet(deviceIds),
      };
    });
  },
}));
