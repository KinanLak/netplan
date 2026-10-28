import type {
  Position,
  WallCommandReason,
  WallCommandResult,
} from "@/types/map";
import { GRID_SIZE } from "@/lib/grid";
import { arePositionsEqual } from "@/walls/gridGeometry/cells";
import { createBrushWallDraft } from "@/walls/gridGeometry/drafts";
import {
  COLLISION_LINE_MESSAGE,
  toLineFailureMessage,
  toRoomFailureMessage,
} from "./messages";
import { stabilizeWallInteractionState } from "./state";
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
): WallInteractionState =>
  stabilizeWallInteractionState(
    state,
    computeMovedWallPointer(state, context, adapter, sample, buttons),
  );

const computeMovedWallPointer = (
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
  const result = computeClickedWallPane(state, context, adapter, sample);
  return {
    state: stabilizeWallInteractionState(state, result.state),
    handled: result.handled,
  };
};

/**
 * Pressing the pane with the wall or room tool sets the first point, so the
 * natural press-drag-release draws the shape (A14); two clicks still do.
 */
export const pressWallPane = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
): WallInteractionState => {
  if (
    !canUseWallTool(context) ||
    (context.activeDrawTool !== "wall" && context.activeDrawTool !== "room") ||
    state.drawAnchor
  ) {
    return state;
  }
  const anchored = clickDrawPane(state, context, adapter, sample);
  return stabilizeWallInteractionState(state, {
    ...anchored,
    pressPointer: anchored.drawAnchor ? sample.pointer : null,
  });
};

const computeClickedWallPane = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: WallInteractionAdapter,
  sample: PointerSample,
): WallInteractionResult => {
  if (!canUseWallTool(context) || !context.currentFloorId) {
    return { state, handled: false };
  }

  if (state.pressPointer) {
    const released = { ...state, pressPointer: null };
    // A press released where it started was a click: the anchor stays for
    // the second one. Released elsewhere, it ends the shape there. On a
    // cell's edge, the press and the release may snap to two cells: the
    // pointer, not the cell, says whether it moved.
    if (
      state.drawAnchor &&
      (arePositionsEqual(sample.snappedPoint, state.drawAnchor) ||
        isNear(sample.pointer, state.pressPointer))
    ) {
      return { state: released, handled: true };
    }
    return {
      state: clickDrawPane(released, context, adapter, sample),
      handled: true,
    };
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

/** Half a cell: the most a click's pointer moves between press and release. */
const CLICK_SLOP = GRID_SIZE / 2;

const isNear = (a: Position, b: Position): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) < CLICK_SLOP;

const canUseWallTool = (context: WallInteractionContext): boolean =>
  context.isEditMode &&
  context.activeDrawTool !== "device" &&
  !!context.currentFloorId;

const applyPointerTracking = (
  state: WallInteractionState,
  context: WallInteractionContext,
  sample: PointerSample,
): WallInteractionState => {
  // The raw pointer is only rendered by the debug panel and the eraser
  // preview; skipping it elsewhere lets same-cell moves keep state identity.
  const isPointerRendered =
    context.trackPointerPosition || context.activeDrawTool === "wall-erase";
  if (!isPointerRendered) {
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
    eraserSize: context.wallEraserSize,
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
    eraserSize: context.wallEraserSize,
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
    eraserSize: context.wallEraserSize,
  });

  return {
    ...state,
    drawMessage: eraseResult.changed ? null : "Aucun bloc de mur à supprimer.",
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
  const refused = brushResult.reason === "collision-with-device";
  const nextMessage = refused
    ? COLLISION_LINE_MESSAGE
    : brushResult.changed
      ? null
      : state.drawMessage;

  return {
    ...state,
    drawMessage: nextMessage,
    refusals: state.refusals + (refused ? 1 : 0),
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
        refusals: state.refusals + (isRefusal(result.reason) ? 1 : 0),
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
      refusals: state.refusals + (isRefusal(roomResult.reason) ? 1 : 0),
    };
  }

  return resetFinishedDrawState(state);
};

const resetFinishedDrawState = (
  state: WallInteractionState,
): WallInteractionState => ({
  ...state,
  pressPointer: null,
  drawAnchor: null,
  lastWallStartPoint: null,
  pointerPreview: null,
  hoverSnapPoint: null,
  drawMessage: null,
});

/** Drawing over walls already there adds nothing, but refuses nothing. */
const isRefusal = (reason: WallCommandReason): boolean =>
  reason !== "already-exists";

const isPrimaryButtonPressed = (buttons: number): boolean =>
  (buttons & 1) === 1;

const unchangedWallResult = (reason: WallCommandReason): WallCommandResult => ({
  changed: false,
  nextWalls: [],
  affectedKeys: [],
  reason,
});
