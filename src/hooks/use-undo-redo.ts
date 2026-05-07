import { useStore } from "zustand";
import { useMapStore } from "@/store/useMapStore";
import type { TemporalState } from "zundo";
import type { MapHistorySnapshot } from "@/store/mapHistory";
import { redoMapChange, undoMapChange } from "@/store/mapHistory";

/**
 * Reactive hook to subscribe to the temporal (undo/redo) store.
 * Use this to read `pastStates.length`, `futureStates.length`, etc. reactively.
 */
export function useTemporalStore<T>(
  selector: (state: TemporalState<MapHistorySnapshot>) => T,
): T {
  return useStore(useMapStore.temporal, selector);
}

/**
 * Module-level stable undo handler.
 * Only accesses store via getState() — no hooks, no re-renders.
 */
function handleUndo() {
  undoMapChange(useMapStore);
}

/**
 * Module-level stable redo handler.
 * Only accesses store via getState() — no hooks, no re-renders.
 */
function handleRedo() {
  redoMapChange(useMapStore);
}

/**
 * Hook providing stable undo/redo handlers.
 * Returns the same function references every render — no unnecessary re-renders in consumers.
 */
export function useUndoRedo() {
  return { handleUndo, handleRedo } as const;
}
