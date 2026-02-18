import { useStore } from "zustand";
import type { TemporalState } from "zundo";
import type { Device, WallSegment } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";

type Snapshot = {
  devices: Array<Device>;
  walls: Array<WallSegment>;
};

/**
 * Reactive hook to subscribe to the temporal (undo/redo) store.
 * Use this to read `pastStates.length`, `futureStates.length`, etc. reactively.
 */
export function useTemporalStore<T>(
  selector: (state: TemporalState<Snapshot>) => T,
): T {
  return useStore(useMapStore.temporal, selector);
}

/**
 * Find the floorId affected by a state change between two snapshots.
 * Checks for added/removed/modified devices and walls.
 * Returns the floorId of the first affected entity, or null if none found.
 */
function findAffectedFloorId(before: Snapshot, after: Snapshot): string | null {
  const beforeDeviceMap = new Map(before.devices.map((d) => [d.id, d]));
  const afterDeviceMap = new Map(after.devices.map((d) => [d.id, d]));

  // Devices added in after (not in before)
  for (const device of after.devices) {
    if (!beforeDeviceMap.has(device.id)) {
      return device.floorId;
    }
  }

  // Devices removed from before (not in after)
  for (const device of before.devices) {
    if (!afterDeviceMap.has(device.id)) {
      return device.floorId;
    }
  }

  // Devices modified (same id, different reference)
  for (const device of after.devices) {
    const prev = beforeDeviceMap.get(device.id);
    if (prev && prev !== device) {
      return device.floorId;
    }
  }

  // Same logic for walls
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

/**
 * Module-level stable undo handler.
 * Only accesses store via getState() — no hooks, no re-renders.
 */
function handleUndo() {
  const currentState = useMapStore.getState();
  if (!currentState.isEditMode) return;

  const temporal = useMapStore.temporal.getState();
  if (temporal.pastStates.length === 0) return;

  const before: Snapshot = {
    devices: currentState.devices,
    walls: currentState.walls,
  };

  temporal.undo();

  const state = useMapStore.getState();
  const after: Snapshot = {
    devices: state.devices,
    walls: state.walls,
  };

  // Auto-navigate to affected floor
  const affectedFloor = findAffectedFloorId(before, after);
  if (affectedFloor && affectedFloor !== state.currentFloorId) {
    state.setCurrentFloor(affectedFloor);
  }

  // Cleanup stale UI references
  cleanupStaleReferences(state);

  // Visual feedback
  window.dispatchEvent(
    new CustomEvent("netplan:undo-redo", { detail: { type: "undo" } }),
  );
}

/**
 * Module-level stable redo handler.
 * Only accesses store via getState() — no hooks, no re-renders.
 */
function handleRedo() {
  const currentState = useMapStore.getState();
  if (!currentState.isEditMode) return;

  const temporal = useMapStore.temporal.getState();
  if (temporal.futureStates.length === 0) return;

  const before: Snapshot = {
    devices: currentState.devices,
    walls: currentState.walls,
  };

  temporal.redo();

  const state = useMapStore.getState();
  const after: Snapshot = {
    devices: state.devices,
    walls: state.walls,
  };

  // Auto-navigate to affected floor
  const affectedFloor = findAffectedFloorId(before, after);
  if (affectedFloor && affectedFloor !== state.currentFloorId) {
    state.setCurrentFloor(affectedFloor);
  }

  // Cleanup stale UI references
  cleanupStaleReferences(state);

  // Visual feedback
  window.dispatchEvent(
    new CustomEvent("netplan:undo-redo", { detail: { type: "redo" } }),
  );
}

/**
 * Hook providing stable undo/redo handlers.
 * Returns the same function references every render — no unnecessary re-renders in consumers.
 */
export function useUndoRedo() {
  return { handleUndo, handleRedo } as const;
}

/**
 * Clear selectedDeviceId and highlightedDeviceIds
 * if they reference entities that no longer exist after undo/redo.
 */
function cleanupStaleReferences(
  state: ReturnType<typeof useMapStore.getState>,
) {
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
}
