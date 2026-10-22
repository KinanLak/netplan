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
  cableDraft: null,
  activeDrawTool: "device" as const,
  isOverlayPanelOpen: false,
  isPlacePanelOpen: false,
  isLabelToolActive: false,
});

export const useMapStore = create<MapStore>()((set, get) => ({
  currentBuildingId: null,
  currentFloorId: null,
  selectedDeviceId: null,
  selectedDeviceIds: [],
  selectedDeviceIdSet: new Set(),
  hoveredDeviceId: null,
  // Everyone opens the map to read it; editing is a choice (B5).
  isEditMode: false,
  isMultiSelectMode: false,
  shownCablesDeviceId: null,
  cableDraft: null,
  activeDrawTool: "device",
  selectedWallColor: "concrete",
  wallEraserSize: WALL_ERASER_DEFAULT_SIZE,
  isOverlayPanelOpen: false,
  isPlacePanelOpen: false,
  isLabelToolActive: false,
  isOverlayHidden: false,
  overlayDraft: null,
  overlayCalibration: null,
  locateRequest: null,

  setCurrentBuilding: (buildingId: BuildingId | null) => {
    set({
      currentBuildingId: buildingId,
      currentFloorId: null,
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
      hoveredDeviceId: null,
      shownCablesDeviceId: null,
      cableDraft: null,
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
      cableDraft: null,
      overlayDraft: null,
      overlayCalibration: null,
    });
  },
  selectDevice: (deviceId) => {
    set((state) =>
      // Also a no-op only when it changes nothing: null clears a selection
      // of several, whose `selectedDeviceId` is already null.
      state.selectedDeviceId === deviceId &&
      state.selectedDeviceIds.length === (deviceId ? 1 : 0)
        ? state
        : {
            selectedDeviceId: deviceId,
            selectedDeviceIds: deviceId ? [deviceId] : [],
            selectedDeviceIdSet: deviceId ? new Set([deviceId]) : new Set(),
            // The device drawer, the calque panel and the placing panel
            // share the right edge.
            isOverlayPanelOpen: deviceId === null && state.isOverlayPanelOpen,
            isPlacePanelOpen: deviceId === null && state.isPlacePanelOpen,
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
      isPlacePanelOpen: false,
      isLabelToolActive: false,
      selectedDeviceId: null,
      selectedDeviceIds: [],
      selectedDeviceIdSet: new Set(),
    }));
  },
  setActiveDrawTool: (tool) => {
    set((state) => ({
      activeDrawTool: tool,
      isOverlayPanelOpen: tool === "device" && state.isOverlayPanelOpen,
      isPlacePanelOpen: tool === "device" && state.isPlacePanelOpen,
      isLabelToolActive: false,
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
            isPlacePanelOpen: false,
            isLabelToolActive: false,
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
  setPlacePanelOpen: (open) => {
    set((state) =>
      open
        ? {
            isPlacePanelOpen: true,
            isOverlayPanelOpen: false,
            isLabelToolActive: false,
            isMultiSelectMode: false,
            activeDrawTool: "device",
            selectedDeviceId: null,
            selectedDeviceIds: [],
            selectedDeviceIdSet: new Set(),
          }
        : state.isPlacePanelOpen
          ? { isPlacePanelOpen: false }
          : state,
    );
  },
  setLabelToolActive: (active) => {
    set((state) =>
      active
        ? {
            isLabelToolActive: true,
            activeDrawTool: "device",
            isMultiSelectMode: false,
            isOverlayPanelOpen: false,
            isPlacePanelOpen: false,
          }
        : state.isLabelToolActive
          ? { isLabelToolActive: false }
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
  setCableDraft: (draft) => {
    set({ cableDraft: draft });
  },
  locateDevice: ({ deviceId, buildingId, floorId }, options = {}) => {
    const state = get();
    if (state.currentBuildingId !== buildingId) {
      state.setCurrentBuilding(buildingId);
    }
    if (get().currentFloorId !== floorId) get().setCurrentFloor(floorId);
    if (options.select) get().selectDevice(deviceId);
    set((current) => ({
      locateRequest: {
        deviceId,
        nonce: (current.locateRequest?.nonce ?? 0) + 1,
      },
    }));
  },
  clearLocateRequest: (nonce) => {
    set((state) =>
      state.locateRequest?.nonce === nonce ? { locateRequest: null } : state,
    );
  },
}));
