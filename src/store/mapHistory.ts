import type { TemporalState } from "zundo";
import type { Device, MapStore, WallSegment } from "@/types/map";
import { UNDO_REDO_EVENT_NAME } from "@/lib/constants";

export type MapHistorySnapshot = {
  devices: Array<Device>;
  walls: Array<WallSegment>;
};

interface MapHistoryStore {
  getState: () => MapStore;
  temporal: {
    getState: () => TemporalState<MapHistorySnapshot>;
  };
}

type MapHistoryDirection = "undo" | "redo";

const createSnapshot = (state: MapStore): MapHistorySnapshot => ({
  devices: state.devices,
  walls: state.walls,
});

export function findAffectedFloorId(
  before: MapHistorySnapshot,
  after: MapHistorySnapshot,
): string | null {
  const beforeDeviceMap = new Map(before.devices.map((d) => [d.id, d]));
  const afterDeviceMap = new Map(after.devices.map((d) => [d.id, d]));

  for (const device of after.devices) {
    if (!beforeDeviceMap.has(device.id)) {
      return device.floorId;
    }
  }

  for (const device of before.devices) {
    if (!afterDeviceMap.has(device.id)) {
      return device.floorId;
    }
  }

  for (const device of after.devices) {
    const prev = beforeDeviceMap.get(device.id);
    if (prev && prev !== device) {
      return device.floorId;
    }
  }

  const beforeWallMap = new Map(before.walls.map((w) => [w.id, w]));
  const afterWallMap = new Map(after.walls.map((w) => [w.id, w]));

  for (const wall of after.walls) {
    if (!beforeWallMap.has(wall.id)) {
      return wall.floorId;
    }
  }

  for (const wall of before.walls) {
    if (!afterWallMap.has(wall.id)) {
      return wall.floorId;
    }
  }

  for (const wall of after.walls) {
    const prev = beforeWallMap.get(wall.id);
    if (prev && prev !== wall) {
      return wall.floorId;
    }
  }

  return null;
}

const cleanupStaleReferences = (state: MapStore) => {
  const deviceIds = new Set(state.devices.map((d) => d.id));

  if (state.selectedDeviceId && !deviceIds.has(state.selectedDeviceId)) {
    state.selectDevice(null);
  }

  const validHighlighted = state.highlightedDeviceIds.filter((id) =>
    deviceIds.has(id),
  );
  if (validHighlighted.length !== state.highlightedDeviceIds.length) {
    state.setHighlightedDevices(validHighlighted);
  }
};

const dispatchMapHistoryEvent = (type: MapHistoryDirection) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(UNDO_REDO_EVENT_NAME, { detail: { type } }),
  );
};

const applyMapHistoryChange = (
  store: MapHistoryStore,
  type: MapHistoryDirection,
) => {
  const currentState = store.getState();
  if (!currentState.isEditMode) return;

  const temporal = store.temporal.getState();
  const canApply =
    type === "undo"
      ? temporal.pastStates.length > 0
      : temporal.futureStates.length > 0;
  if (!canApply) return;

  const before = createSnapshot(currentState);

  if (type === "undo") {
    temporal.undo();
  } else {
    temporal.redo();
  }

  const state = store.getState();
  const after = createSnapshot(state);
  const affectedFloor = findAffectedFloorId(before, after);

  if (affectedFloor && affectedFloor !== state.currentFloorId) {
    state.setCurrentFloor(affectedFloor);
  }

  cleanupStaleReferences(store.getState());
  dispatchMapHistoryEvent(type);
};

export const undoMapChange = (store: MapHistoryStore) => {
  applyMapHistoryChange(store, "undo");
};

export const redoMapChange = (store: MapHistoryStore) => {
  applyMapHistoryChange(store, "redo");
};
