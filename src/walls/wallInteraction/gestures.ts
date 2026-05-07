import type {
  Position,
  WallCommandReason,
  WallCommandResult,
} from "@/types/map";
import { arePositionsEqual } from "@/walls/gridGeometry/cells";
import { createBrushWallDraft } from "@/walls/gridGeometry/drafts";
import { toLineFailureMessage, toRoomFailureMessage } from "./messages";
import type {
  PointerSample,
  WallInteractionAdapter,
  WallInteractionContext,
  WallInteractionResult,
  WallInteractionState,
} from "./types";

export const moveWallPointer = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
  buttons: number,
): WallInteractionState => {
  if (!canUseWallTool(context)) {
    return state;
  }

  const withPointer = applyPointerTracking(state, context, sample);

  if (context.activeDrawTool === "wall-erase") {
    return moveErasePointer(withPointer, context, adapter, sample, buttons);
  }

  if (context.activeDrawTool === "wall-brush") {
    return moveBrushPointer(withPointer, context, adapter, sample, buttons);
  }

  return {
    ...withPointer,
    pointerPreview: withPointer.drawAnchor ? sample.snappedPoint : null,
    hoverSnapPoint: sample.snappedPoint,
    erasePreviewKeys: [],
  };
};

export const clickWallPane = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
): WallInteractionResult => {
  if (!canUseWallTool(context) || !context.currentFloorId) {
    return { state, handled: false };
  }

  if (context.activeDrawTool === "wall-erase") {
    return {
      state: clickErasePane(state, context, adapter, sample),
      handled: true,
    };
  }

  if (context.activeDrawTool === "wall-brush") {
    return {
      state: clickBrushPane(state, context, adapter, sample),
      handled: true,
    };
  }

  return {
    state: clickDrawPane(state, context, adapter, sample),
    handled: true,
  };
};

const canUseWallTool = (context: WallInteractionContext): boolean =>
  context.isEditMode &&
  context.activeDrawTool !== "device" &&
  !!context.currentFloorId;

const applyPointerTracking = (
  state: WallInteractionState,
  context: WallInteractionContext,
  sample: PointerSample,
): WallInteractionState => {
  if (!context.trackPointerPosition) {
    return state;
  }

  return {
    ...state,
    pointerPosition: sample.pointer,
    pointerSnapPoint: sample.snappedPoint,
  };
};

const previewErase = (
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
): Array<string> => {
  if (!context.currentFloorId) {
    return [];
  }

  return adapter.previewEraseWallAtPointer({
    floorId: context.currentFloorId,
    pointer: sample.pointer,
    snappedPoint: sample.snappedPoint,
  }).affectedKeys;
};

const addBrushAtPoint = (
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  snappedPoint: Position,
): WallCommandResult => {
  if (!context.currentFloorId) {
    return unchangedWallResult("invalid-line");
  }

  return adapter.addWallLine(
    createBrushWallDraft(
      context.currentFloorId,
      snappedPoint,
      context.selectedWallColor,
    ),
  );
};

const moveErasePointer = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
  buttons: number,
): WallInteractionState => {
  if (!context.currentFloorId) {
    return state;
  }

  const baseState: WallInteractionState = {
    ...state,
    hoverSnapPoint: sample.snappedPoint,
    pointerPreview: null,
    erasePreviewKeys: previewErase(context, adapter, sample),
  };

  if (!isPrimaryButtonPressed(buttons)) {
    return {
      ...baseState,
      eraseStrokeLastSample: null,
      isEraseStrokeActive: false,
    };
  }

  if (!baseState.isEraseStrokeActive) {
    return {
      ...baseState,
      isEraseStrokeActive: true,
      eraseStrokeLastSample: sample,
    };
  }

  const previous = baseState.eraseStrokeLastSample;
  if (!previous) {
    return {
      ...baseState,
      eraseStrokeLastSample: sample,
    };
  }

  const strokeResult = adapter.eraseWallStroke({
    floorId: context.currentFloorId,
    fromPointer: previous.pointer,
    fromSnappedPoint: previous.snappedPoint,
    toPointer: sample.pointer,
    toSnappedPoint: sample.snappedPoint,
  });

  return {
    ...baseState,
    drawMessage: strokeResult.changed ? null : baseState.drawMessage,
    ignoreNextEraseClick: true,
    eraseStrokeLastSample: sample,
  };
};

const moveBrushPointer = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
  buttons: number,
): WallInteractionState => {
  if (!context.currentFloorId) {
    return state;
  }

  const baseState: WallInteractionState = {
    ...state,
    hoverSnapPoint: sample.snappedPoint,
    pointerPreview: null,
    erasePreviewKeys: [],
  };

  if (!isPrimaryButtonPressed(buttons)) {
    return {
      ...baseState,
      brushStrokeLastSample: null,
      isBrushStrokeActive: false,
    };
  }

  if (!baseState.isBrushStrokeActive) {
    addBrushAtPoint(context, adapter, sample.snappedPoint);

    return {
      ...baseState,
      isBrushStrokeActive: true,
      brushStrokeLastSample: sample,
      ignoreNextBrushClick: true,
    };
  }

  const previous = baseState.brushStrokeLastSample;
  if (!previous) {
    addBrushAtPoint(context, adapter, sample.snappedPoint);

    return {
      ...baseState,
      brushStrokeLastSample: sample,
      ignoreNextBrushClick: true,
    };
  }

  const strokeResult = adapter.addWallLine({
    floorId: context.currentFloorId,
    start: previous.snappedPoint,
    end: sample.snappedPoint,
    color: context.selectedWallColor,
  });

  return {
    ...baseState,
    drawMessage: strokeResult.changed ? null : baseState.drawMessage,
    ignoreNextBrushClick: true,
    brushStrokeLastSample: sample,
  };
};

const clickErasePane = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
): WallInteractionState => {
  if (!context.currentFloorId) {
    return state;
  }

  if (state.ignoreNextEraseClick) {
    return { ...state, ignoreNextEraseClick: false };
  }

  const eraseResult = adapter.eraseWallAtPointer({
    floorId: context.currentFloorId,
    pointer: sample.pointer,
    snappedPoint: sample.snappedPoint,
  });

  return {
    ...state,
    drawMessage: eraseResult.changed ? null : "Aucun bloc de mur a supprimer.",
    hoverSnapPoint: sample.snappedPoint,
    pointerPreview: null,
    erasePreviewKeys: previewErase(context, adapter, sample),
  };
};

const clickBrushPane = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
): WallInteractionState => {
  if (state.ignoreNextBrushClick) {
    return { ...state, ignoreNextBrushClick: false };
  }

  const brushResult = addBrushAtPoint(context, adapter, sample.snappedPoint);
  const nextMessage =
    brushResult.reason === "collision-with-device"
      ? "Mur refuse: collision avec un device."
      : brushResult.changed
        ? null
        : state.drawMessage;

  return {
    ...state,
    drawMessage: nextMessage,
    hoverSnapPoint: sample.snappedPoint,
    pointerPreview: null,
  };
};

const clickDrawPane = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
): WallInteractionState => {
  if (!context.currentFloorId) {
    return state;
  }

  const drawPoint =
    context.activeDrawTool === "wall" &&
    !state.drawAnchor &&
    state.hoverSnapPoint
      ? state.hoverSnapPoint
      : sample.snappedPoint;

  if (!state.drawAnchor) {
    return {
      ...state,
      pointerPreview: drawPoint,
      drawAnchor: drawPoint,
      lastWallStartPoint:
        context.activeDrawTool === "wall"
          ? drawPoint
          : state.lastWallStartPoint,
      drawMessage: null,
    };
  }

  if (arePositionsEqual(drawPoint, state.drawAnchor)) {
    return {
      ...state,
      pointerPreview: null,
      drawAnchor: null,
      drawMessage: null,
    };
  }

  if (context.activeDrawTool === "wall") {
    const result = adapter.addWallLine({
      floorId: context.currentFloorId,
      start: state.drawAnchor,
      end: drawPoint,
      color: context.selectedWallColor,
    });

    if (!result.changed) {
      return {
        ...state,
        pointerPreview: drawPoint,
        drawMessage: toLineFailureMessage(result.reason),
      };
    }

    return resetFinishedDrawState(state);
  }

  const roomResult = adapter.addWallRoom({
    floorId: context.currentFloorId,
    start: state.drawAnchor,
    end: drawPoint,
    color: context.selectedWallColor,
  });

  if (!roomResult.changed) {
    return {
      ...state,
      pointerPreview: drawPoint,
      drawMessage: toRoomFailureMessage(roomResult.reason),
    };
  }

  return resetFinishedDrawState(state);
};

const resetFinishedDrawState = (
  state: WallInteractionState,
): WallInteractionState => ({
  ...state,
  drawAnchor: null,
  lastWallStartPoint: null,
  pointerPreview: null,
  hoverSnapPoint: null,
  drawMessage: null,
});

const isPrimaryButtonPressed = (buttons: number): boolean =>
  (buttons & 1) === 1;

const unchangedWallResult = (reason: WallCommandReason): WallCommandResult => ({
  changed: false,
  nextWalls: [],
  affectedKeys: [],
  reason,
});
