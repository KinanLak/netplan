import { create } from "zustand";
import type {
  BuildingId,
  DeviceId,
  DrawTool,
  FloorId,
  MapStore,
  WallColor,
} from "@/types/map";

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
  hoveredDeviceId: null,
  isEditMode: true,
  canvasBackgroundMode: "custom",
  highlightedDeviceIds: [],
  highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
  activeDrawTool: "device" as DrawTool,
  selectedWallColor: "concrete" as WallColor,

  setCurrentBuilding: (buildingId: BuildingId | null) => {
    set({
      currentBuildingId: buildingId,
      currentFloorId: null,
      selectedDeviceId: null,
      hoveredDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
    });
  },
  setCurrentFloor: (floorId: FloorId | null) => {
    set({
      currentFloorId: floorId,
      selectedDeviceId: null,
      hoveredDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
    });
  },
  selectDevice: (deviceId) => {
    set((state) =>
      state.selectedDeviceId === deviceId
        ? state
        : { selectedDeviceId: deviceId },
    );
  },
  setHoveredDevice: (deviceId) => {
    set((state) =>
      state.hoveredDeviceId === deviceId
        ? state
        : { hoveredDeviceId: deviceId },
    );
  },
  toggleEditMode: () => {
    set((state) => ({
      isEditMode: !state.isEditMode,
      activeDrawTool: state.isEditMode ? "device" : state.activeDrawTool,
    }));
  },
  setActiveDrawTool: (tool) => {
    set({ activeDrawTool: tool });
  },
  setSelectedWallColor: (color) => {
    set({ selectedWallColor: color });
  },
  setCanvasBackgroundMode: (mode) => {
    set({ canvasBackgroundMode: mode });
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
