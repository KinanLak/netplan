import type { TemporalState } from "zundo";
import { UNDO_REDO_EVENT_NAME } from "@/lib/constants";

// Snapshot consumed by the temporal middleware. The full inverse-command
// history lands in step 9 (Plan §5.9). For now we keep a placeholder so
// `useTemporalStore` and the undo/redo wiring stay alive but inert.
export interface MapHistorySnapshot {
  undoStackLength: number;
  redoStackLength: number;
}

interface MapHistoryStore {
  getState: () => unknown;
  temporal: {
    getState: () => TemporalState<MapHistorySnapshot>;
  };
}

const dispatchMapHistoryEvent = (type: "undo" | "redo") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UNDO_REDO_EVENT_NAME, { detail: { type } }),
  );
};

export const undoMapChange = (store: MapHistoryStore) => {
  const temporal = store.temporal.getState();
  if (temporal.pastStates.length === 0) return;
  temporal.undo();
  dispatchMapHistoryEvent("undo");
};

export const redoMapChange = (store: MapHistoryStore) => {
  const temporal = store.temporal.getState();
  if (temporal.futureStates.length === 0) return;
  temporal.redo();
  dispatchMapHistoryEvent("redo");
};
