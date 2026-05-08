import { useRef } from "react";
import { useMutation } from "convex/react";
import { useMapStore } from "@/store/useMapStore";
import {
  dispatchUndoRedoEvent,
  executeInverseCommand,
} from "@/store/mapHistory";
import type { InverseCommandRunners } from "@/store/mapHistory";
import type { InverseCommand } from "@/types/map";
import { api } from "../../convex/_generated/api";

interface TemporalView {
  pastStates: ReadonlyArray<InverseCommand>;
  futureStates: ReadonlyArray<InverseCommand>;
}

/**
 * Reactive view over the inverse-command undo/redo stacks. Kept under the
 * old `useTemporalStore` name for callsite compatibility; the shape mimics
 * zundo's `TemporalState` so consumers can read `pastStates.length` /
 * `futureStates.length` without churn.
 */
export function useTemporalStore<T>(selector: (state: TemporalView) => T): T {
  return useMapStore((s) =>
    selector({ pastStates: s.undoStack, futureStates: s.redoStack }),
  );
}

export function useUndoRedo() {
  const createDevice = useMutation(api.devices.create);
  const removeDevice = useMutation(api.devices.remove);
  const updatePosition = useMutation(api.devices.updatePosition);
  const addStroke = useMutation(api.walls.addStroke);
  const eraseStroke = useMutation(api.walls.eraseStroke);

  const pendingRef = useRef<Promise<void>>(Promise.resolve());

  const runners: InverseCommandRunners = {
    createDevice: (draft) =>
      createDevice({
        floorId: draft.floorId,
        type: draft.type,
        name: draft.name,
        hostname: draft.hostname,
        position: draft.position,
        size: draft.size,
        metadata: draft.metadata,
      }),
    removeDevice: (args) => removeDevice(args),
    updatePosition: (args) => updatePosition(args),
    addStroke: (args) =>
      addStroke({ floorId: args.floorId, segments: args.segments }),
    eraseStroke: (args) =>
      eraseStroke({ floorId: args.floorId, removeIds: args.removeIds }),
  };

  const handleUndo = () => {
    pendingRef.current = pendingRef.current.then(async () => {
      const command = useMapStore.getState().takeUndo();
      if (!command) return;
      try {
        const inverse = await executeInverseCommand(command, runners);
        useMapStore.getState().queueRedo(inverse);
        dispatchUndoRedoEvent("undo");
      } catch (error) {
        console.error("undo failed", error);
        useMapStore.getState().queueUndo(command);
      }
    });
  };

  const handleRedo = () => {
    pendingRef.current = pendingRef.current.then(async () => {
      const command = useMapStore.getState().takeRedo();
      if (!command) return;
      try {
        const inverse = await executeInverseCommand(command, runners);
        useMapStore.getState().queueUndo(inverse);
        dispatchUndoRedoEvent("redo");
      } catch (error) {
        console.error("redo failed", error);
        useMapStore.getState().queueRedo(command);
      }
    });
  };

  return { handleUndo, handleRedo } as const;
}
