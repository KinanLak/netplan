import { create } from "zustand";
import { temporal } from "zundo";
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

// Inverse-command undo/redo stack lives here. The full implementation lands in
// step 9; for now both stacks stay empty so the temporal middleware and the
// undo/redo UI keep wiring without errors.
interface MapHistorySnapshot {
  undoStackLength: number;
  redoStackLength: number;
}

const partializeHistory = (_state: MapStore): MapHistorySnapshot => ({
  undoStackLength: 0,
  redoStackLength: 0,
});

const areMapHistorySnapshotsEqual = (
  a: MapHistorySnapshot,
  b: MapHistorySnapshot,
): boolean =>
  a.undoStackLength === b.undoStackLength &&
  a.redoStackLength === b.redoStackLength;

export const useMapStore = create<MapStore>()(
  temporal(
    (set) => ({
      currentBuildingId: null,
      currentFloorId: null,
      selectedDeviceId: null,
      hoveredDeviceId: null,
      isEditMode: true,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
      activeDrawTool: "device" as DrawTool,
      selectedWallColor: "concrete" as WallColor,

      setCurrentBuilding: (buildingId: BuildingId | null) => {
        set({
          currentBuildingId: buildingId,
          selectedDeviceId: null,
          highlightedDeviceIds: [],
          highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
        });
      },
      setCurrentFloor: (floorId: FloorId | null) => {
        set({
          currentFloorId: floorId,
          selectedDeviceId: null,
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
    }),
    {
      partialize: partializeHistory,
      equality: areMapHistorySnapshotsEqual,
      limit: 500,
    },
  ),
);
