import { useStore } from "zustand";
import type { TemporalState } from "zundo";
import type { Connection, Device, MapDocument, WallSegment } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";

type Snapshot = {
  document: MapDocument;
};

export function useTemporalStore<T>(
  selector: (state: TemporalState<Snapshot>) => T,
): T {
  return useStore(useMapStore.temporal, selector);
}

const findAffectedFloorId = (
  before: MapDocument,
  after: MapDocument,
): string | null => {
  const findChangedFloor = <T extends Device | WallSegment | Connection>(
    previousItems: Array<T>,
    nextItems: Array<T>,
    getFloorId: (item: T) => string,
  ): string | null => {
    const previousMap = new Map(previousItems.map((item) => [item.id, item]));
    const nextMap = new Map(nextItems.map((item) => [item.id, item]));

    for (const item of nextItems) {
      if (!previousMap.has(item.id)) {
        return getFloorId(item);
      }
    }

    for (const item of previousItems) {
      if (!nextMap.has(item.id)) {
        return getFloorId(item);
      }
    }

    for (const item of nextItems) {
      const previous = previousMap.get(item.id);
      if (previous && previous !== item) {
        return getFloorId(item);
      }
    }

    return null;
  };

  return (
    findChangedFloor(
      before.devices,
      after.devices,
      (device) => device.floorId,
    ) ??
    findChangedFloor(before.walls, after.walls, (wall) => wall.floorId) ??
    findChangedFloor(
      before.connections,
      after.connections,
      (connection) => connection.floorId,
    )
  );
};

function handleUndo() {
  const uiState = useMapUiStore.getState();
  if (!uiState.isEditMode) return;

  const temporal = useMapStore.temporal.getState();
  if (temporal.pastStates.length === 0) return;

  const before = useMapStore.getState().document;
  temporal.undo();

  const after = useMapStore.getState().document;
  const affectedFloorId = findAffectedFloorId(before, after);
  const nextUiState = useMapUiStore.getState();

  if (affectedFloorId && affectedFloorId !== nextUiState.currentFloorId) {
    nextUiState.setCurrentFloor(affectedFloorId);
  } else {
    nextUiState.syncWithDocument(after);
  }

  window.dispatchEvent(
    new CustomEvent("netplan:undo-redo", { detail: { type: "undo" } }),
  );
}

function handleRedo() {
  const uiState = useMapUiStore.getState();
  if (!uiState.isEditMode) return;

  const temporal = useMapStore.temporal.getState();
  if (temporal.futureStates.length === 0) return;

  const before = useMapStore.getState().document;
  temporal.redo();

  const after = useMapStore.getState().document;
  const affectedFloorId = findAffectedFloorId(before, after);
  const nextUiState = useMapUiStore.getState();

  if (affectedFloorId && affectedFloorId !== nextUiState.currentFloorId) {
    nextUiState.setCurrentFloor(affectedFloorId);
  } else {
    nextUiState.syncWithDocument(after);
  }

  window.dispatchEvent(
    new CustomEvent("netplan:undo-redo", { detail: { type: "redo" } }),
  );
}

export function useUndoRedo() {
  return { handleUndo, handleRedo } as const;
}
