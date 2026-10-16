import { create } from "zustand";
import type {
  BuildingId,
  DeviceId,
  FloorId,
  MapInteractionState,
  MapStore,
} from "@/types/map";
import { WALL_ERASER_DEFAULT_SIZE, clampWallEraserSize } from "@/lib/constants";

const withoutMultiSelect = (state: MapInteractionState) => ({
  isMultiSelectMode: false,
  ...(state.isMultiSelectMode
    ? {
        selectedDeviceId: null,
        selectedDeviceIds: [],
        selectedDeviceIdSet: new Set<DeviceId>(),
      }
    : {}),
});

const withoutEditTools = (state: MapInteractionState) => ({
  ...withoutMultiSelect(state),
  activeDrawTool: "device" as const,
  isOverlayPanelOpen: false,
});

export const useMapStore = create<MapStore>()((set) => ({
  currentBuildingId: null,
  currentFloorId: null,
  selectedDeviceId: null,
  selectedDeviceIds: [],
  selectedDeviceIdSet: new Set(),
  hoveredDeviceId: null,
  isEditMode: true,
  isMultiSelectMode: false,
  shownCablesDeviceId: null,
  activeDrawTool: "device",
  selectedWallColor: "concrete",
  wallEraserSize: WALL_ERASER_DEFAULT_SIZE,
  isOverlayPanelOpen: false,
  isOverlayHidden: false,
  overlayDraft: null,
  overlayCalibration: null,

  setCurrentBuilding: (buildingId: BuildingId | null) => {
    set({
      currentBuildingId: buildingId,
      currentFloorId: null,
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
      hoveredDeviceId: null,
      shownCablesDeviceId: null,
      overlayDraft: null,
      overlayCalibration: null,
    });
  },
  setCurrentFloor: (floorId: FloorId | null) => {
    set({
      currentFloorId: floorId,
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
      hoveredDeviceId: null,
      shownCablesDeviceId: null,
      overlayDraft: null,
      overlayCalibration: null,
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
            // The device drawer and the calque panel share the right edge.
            isOverlayPanelOpen: deviceId === null && state.isOverlayPanelOpen,
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
    set((state) => ({
      isEditMode: !state.isEditMode,
      ...(state.isEditMode
        ? withoutEditTools(state)
        : withoutMultiSelect(state)),
    }));
  },
  leaveEditTools: () => {
    set(withoutEditTools);
  },
  toggleMultiSelectMode: () => {
    set((state) => ({
      isMultiSelectMode: !state.isMultiSelectMode,
      activeDrawTool: "device",
      isOverlayPanelOpen: false,
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
    }));
  },
  setActiveDrawTool: (tool) => {
    set((state) => ({
      activeDrawTool: tool,
      isOverlayPanelOpen: tool === "device" && state.isOverlayPanelOpen,
    }));
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
  setOverlayPanelOpen: (open) => {
    set((state) =>
      open
        ? {
            isOverlayPanelOpen: true,
            isMultiSelectMode: false,
            activeDrawTool: "device",
            selectedDeviceId: null,
            selectedDeviceIds: [],
            selectedDeviceIdSet: new Set(),
          }
        : state.isOverlayPanelOpen
          ? { isOverlayPanelOpen: false }
          : state,
    );
  },
  toggleOverlayHidden: () => {
    set((state) => ({ isOverlayHidden: !state.isOverlayHidden }));
  },
  setOverlayDraft: (draft) => {
    set({ overlayDraft: draft });
  },
  setOverlayCalibration: (calibration) => {
    set({ overlayCalibration: calibration });
  },
  showCables: (deviceId) => {
    set((state) =>
      state.shownCablesDeviceId === deviceId
        ? state
        : { shownCablesDeviceId: deviceId },
    );
  },
}));
