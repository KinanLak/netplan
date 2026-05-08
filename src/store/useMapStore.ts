import { create } from "zustand";
import type {
  BuildingId,
  DeviceId,
  DrawTool,
  FloorId,
  InverseCommand,
  MapStore,
  WallColor,
} from "@/types/map";

const HISTORY_LIMIT = 200;
const EMPTY_HISTORY: ReadonlyArray<InverseCommand> = [];

const appendCapped = (
  stack: ReadonlyArray<InverseCommand>,
  command: InverseCommand,
): ReadonlyArray<InverseCommand> => {
  const next = [...stack, command];
  return next.length > HISTORY_LIMIT
    ? next.slice(next.length - HISTORY_LIMIT)
    : next;
};

const EMPTY_HIGHLIGHT_SET: ReadonlySet<DeviceId> = new Set<DeviceId>();
const toHighlightedDeviceIdSet = (
  deviceIds: ReadonlyArray<DeviceId>,
): ReadonlySet<DeviceId> => {
  return deviceIds.length === 0 ? EMPTY_HIGHLIGHT_SET : new Set(deviceIds);
};

export const useMapStore = create<MapStore>()((set, get) => ({
  currentBuildingId: null,
  currentFloorId: null,
  selectedDeviceId: null,
  hoveredDeviceId: null,
  isEditMode: true,
  highlightedDeviceIds: [],
  highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
  activeDrawTool: "device" as DrawTool,
  selectedWallColor: "concrete" as WallColor,
  undoStack: EMPTY_HISTORY,
  redoStack: EMPTY_HISTORY,

  setCurrentBuilding: (buildingId: BuildingId | null) => {
    set({
      currentBuildingId: buildingId,
      selectedDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
      undoStack: EMPTY_HISTORY,
      redoStack: EMPTY_HISTORY,
    });
  },
  setCurrentFloor: (floorId: FloorId | null) => {
    set({
      currentFloorId: floorId,
      selectedDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
      undoStack: EMPTY_HISTORY,
      redoStack: EMPTY_HISTORY,
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

  pushHistory: (command) => {
    set((state) => ({
      undoStack: appendCapped(state.undoStack, command),
      redoStack: EMPTY_HISTORY,
    }));
  },
  takeUndo: () => {
    const stack = get().undoStack;
    if (stack.length === 0) return null;
    const top = stack[stack.length - 1] ?? null;
    set({ undoStack: stack.slice(0, -1) });
    return top;
  },
  takeRedo: () => {
    const stack = get().redoStack;
    if (stack.length === 0) return null;
    const top = stack[stack.length - 1] ?? null;
    set({ redoStack: stack.slice(0, -1) });
    return top;
  },
  queueRedo: (command) => {
    set((state) => ({
      redoStack: appendCapped(state.redoStack, command),
    }));
  },
  queueUndo: (command) => {
    set((state) => ({
      undoStack: appendCapped(state.undoStack, command),
    }));
  },
  clearHistory: () => {
    set({ undoStack: EMPTY_HISTORY, redoStack: EMPTY_HISTORY });
  },
}));
