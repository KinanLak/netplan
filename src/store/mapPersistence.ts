import type { PersistOptions } from "zustand/middleware";
import type { DrawTool, MapStore } from "@/types/map";

export const MAP_STORAGE_NAME = "netplan-storage";
export const MAP_STORAGE_VERSION = 3;

type PersistedMapState = Partial<
  Pick<
    MapStore,
    | "devices"
    | "walls"
    | "currentBuildingId"
    | "currentFloorId"
    | "isEditMode"
    | "activeDrawTool"
    | "selectedWallColor"
  >
>;

type PersistedMapStateInput = Omit<PersistedMapState, "activeDrawTool"> & {
  activeDrawTool?: string;
};

export const normalizeActiveDrawTool = (tool: string | undefined): DrawTool => {
  if (
    tool === "device" ||
    tool === "wall" ||
    tool === "wall-brush" ||
    tool === "wall-erase" ||
    tool === "room"
  ) {
    return tool;
  }

  return "device";
};

export const migrateMapState: NonNullable<
  PersistOptions<MapStore, PersistedMapState>["migrate"]
> = (persistedState, version) => {
  if (!persistedState || typeof persistedState !== "object") {
    return {};
  }

  const typedState: PersistedMapStateInput = { ...persistedState };
  const migratedState: PersistedMapState = {
    ...typedState,
    activeDrawTool: normalizeActiveDrawTool(typedState.activeDrawTool),
  };

  if (version < MAP_STORAGE_VERSION) {
    migratedState.walls = [];
  }

  return migratedState;
};

export const partializeMapHistory = (state: MapStore) => ({
  devices: state.devices,
  walls: state.walls,
});

export const areMapHistorySnapshotsEqual = (
  pastState: ReturnType<typeof partializeMapHistory>,
  currentState: ReturnType<typeof partializeMapHistory>,
) =>
  pastState.devices === currentState.devices &&
  pastState.walls === currentState.walls;

export const partializePersistedMapState = (state: MapStore) => ({
  devices: state.devices,
  walls: state.walls,
  currentBuildingId: state.currentBuildingId,
  currentFloorId: state.currentFloorId,
  isEditMode: state.isEditMode,
  activeDrawTool: state.activeDrawTool,
  selectedWallColor: state.selectedWallColor,
});
