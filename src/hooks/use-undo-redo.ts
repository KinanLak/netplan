import {
  useMapDocumentActions,
  useMapDocumentHistory,
} from "@/map-session/useMapDocument";
import type { TemporalView } from "@/map-session/history";

export function useTemporalStore<T>(selector: (state: TemporalView) => T): T {
  const history = useMapDocumentHistory();
  return selector({
    pastStates: history.undoStack,
    futureStates: history.redoStack,
  });
}

export function useUndoRedo() {
  const { undo, redo } = useMapDocumentActions();
  return { handleUndo: undo, handleRedo: redo } as const;
}
