import { create } from "zustand";
import type { DrawTool, MapDocument, WallColor } from "@/types/map";

const toHighlightedDeviceIdSet = (
  deviceIds: ReadonlyArray<string>,
): ReadonlySet<string> => new Set(deviceIds);

const getDefaultBuildingId = (document: MapDocument): string | null =>
  document.buildings[0]?.id ?? null;

const getDefaultFloorIdForBuilding = (
  document: MapDocument,
  buildingId: string | null,
): string | null => {
  if (!buildingId) {
    return null;
  }

  return (
    document.buildings.find((building) => building.id === buildingId)?.floors[0]
      ?.id ?? null
  );
};

const sanitizeFloorSelection = (
  document: MapDocument,
  currentBuildingId: string | null,
  currentFloorId: string | null,
): {
  currentBuildingId: string | null;
  currentFloorId: string | null;
} => {
  if (document.buildings.length === 0) {
    return {
      currentBuildingId: null,
      currentFloorId: null,
    };
  }

  const building =
    document.buildings.find(
      (candidate) => candidate.id === currentBuildingId,
    ) ?? document.buildings[0];

  const floor =
    building.floors.find((candidate) => candidate.id === currentFloorId) ??
    building.floors[0];

  return {
    currentBuildingId: building.id,
    currentFloorId: floor.id,
  };
};

export interface MapUiState {
  currentBuildingId: string | null;
  currentFloorId: string | null;
  selectedDeviceId: string | null;
  hoveredDeviceId: string | null;
  isEditMode: boolean;
  highlightedDeviceIds: Array<string>;
  highlightedDeviceIdSet: ReadonlySet<string>;
  activeDrawTool: DrawTool;
  selectedWallColor: WallColor;
}

export interface MapUiActions {
  resetForDocument: (document: MapDocument) => void;
  syncWithDocument: (document: MapDocument) => void;
  setCurrentBuilding: (buildingId: string, floorId: string | null) => void;
  setCurrentFloor: (floorId: string) => void;
  selectDevice: (deviceId: string | null) => void;
  setHoveredDevice: (deviceId: string | null) => void;
  toggleEditMode: () => void;
  setActiveDrawTool: (tool: DrawTool) => void;
  setSelectedWallColor: (color: WallColor) => void;
  setHighlightedDevices: (deviceIds: Array<string>) => void;
}

export type MapUiStore = MapUiState & MapUiActions;

const createInitialUiState = (document: MapDocument): MapUiState => {
  const currentBuildingId = getDefaultBuildingId(document);

  return {
    currentBuildingId,
    currentFloorId: getDefaultFloorIdForBuilding(document, currentBuildingId),
    selectedDeviceId: null,
    hoveredDeviceId: null,
    isEditMode: true,
    highlightedDeviceIds: [],
    highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
    activeDrawTool: "device",
    selectedWallColor: "concrete",
  };
};

const sanitizeUiState = (
  state: MapUiState,
  document: MapDocument,
): Partial<MapUiState> => {
  const nextNavigation = sanitizeFloorSelection(
    document,
    state.currentBuildingId,
    state.currentFloorId,
  );
  const deviceMap = new Map(
    document.devices.map((device) => [device.id, device]),
  );
  const currentFloorId = nextNavigation.currentFloorId;

  const selectedDevice = state.selectedDeviceId
    ? deviceMap.get(state.selectedDeviceId)
    : undefined;
  const hoveredDevice = state.hoveredDeviceId
    ? deviceMap.get(state.hoveredDeviceId)
    : undefined;

  const selectedDeviceId =
    selectedDevice && selectedDevice.floorId === currentFloorId
      ? selectedDevice.id
      : null;
  const hoveredDeviceId =
    hoveredDevice && hoveredDevice.floorId === currentFloorId
      ? hoveredDevice.id
      : null;
  const highlightedDeviceIds = state.highlightedDeviceIds.filter((deviceId) => {
    const device = deviceMap.get(deviceId);
    return Boolean(device && device.floorId === currentFloorId);
  });

  return {
    ...nextNavigation,
    selectedDeviceId,
    hoveredDeviceId,
    highlightedDeviceIds,
    highlightedDeviceIdSet: toHighlightedDeviceIdSet(highlightedDeviceIds),
  };
};

const resetSelectionState = {
  selectedDeviceId: null,
  hoveredDeviceId: null,
  highlightedDeviceIds: [],
  highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
} satisfies Pick<
  MapUiState,
  | "selectedDeviceId"
  | "hoveredDeviceId"
  | "highlightedDeviceIds"
  | "highlightedDeviceIdSet"
>;

export const useMapUiStore = create<MapUiStore>()((set) => ({
  ...createInitialUiState({
    buildings: [],
    devices: [],
    walls: [],
    connections: [],
  }),

  resetForDocument: (document) => {
    set((state) => ({
      ...state,
      ...createInitialUiState(document),
      isEditMode: state.isEditMode,
      activeDrawTool: state.isEditMode ? "device" : state.activeDrawTool,
      selectedWallColor: state.selectedWallColor,
    }));
  },

  syncWithDocument: (document) => {
    set((state) => sanitizeUiState(state, document));
  },

  setCurrentBuilding: (buildingId, floorId) => {
    set({
      currentBuildingId: buildingId,
      currentFloorId: floorId,
      ...resetSelectionState,
    });
  },

  setCurrentFloor: (floorId) => {
    set({
      currentFloorId: floorId,
      ...resetSelectionState,
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

  setHighlightedDevices: (deviceIds) => {
    set((state) => {
      const isSameHighlightState =
        state.highlightedDeviceIds.length === deviceIds.length &&
        state.highlightedDeviceIds.every(
          (deviceId, index) => deviceId === deviceIds[index],
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
