import type { Position } from "@/types/map";
import { arePositionsEqual } from "@/walls/gridGeometry/cells";
import type {
  PointerSample,
  WallInteractionAdapter,
  WallInteractionContext,
  WallInteractionResult,
  WallInteractionState,
} from "./types";

const areNullablePositionsEqual = (
  a: Position | null,
  b: Position | null,
): boolean => a === b || (a !== null && b !== null && arePositionsEqual(a, b));

const arePointerSamplesEqual = (
  a: PointerSample | null,
  b: PointerSample | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    arePositionsEqual(a.pointer, b.pointer) &&
    arePositionsEqual(a.snappedPoint, b.snappedPoint));

const areEraseKeysEqual = (a: Array<string>, b: Array<string>): boolean =>
  a === b ||
  (a.length === b.length && a.every((key, index) => key === b[index]));

export const areWallInteractionStatesEqual = (
  a: WallInteractionState,
  b: WallInteractionState,
): boolean =>
  a === b ||
  (areNullablePositionsEqual(a.drawAnchor, b.drawAnchor) &&
    areNullablePositionsEqual(a.pointerPreview, b.pointerPreview) &&
    areNullablePositionsEqual(a.hoverSnapPoint, b.hoverSnapPoint) &&
    areNullablePositionsEqual(a.pointerPosition, b.pointerPosition) &&
    areNullablePositionsEqual(a.pointerSnapPoint, b.pointerSnapPoint) &&
    areNullablePositionsEqual(a.lastWallStartPoint, b.lastWallStartPoint) &&
    a.drawMessage === b.drawMessage &&
    areEraseKeysEqual(a.erasePreviewKeys, b.erasePreviewKeys) &&
    arePointerSamplesEqual(a.eraseStrokeLastSample, b.eraseStrokeLastSample) &&
    a.isEraseStrokeActive === b.isEraseStrokeActive &&
    a.ignoreNextEraseClick === b.ignoreNextEraseClick &&
    arePointerSamplesEqual(a.brushStrokeLastSample, b.brushStrokeLastSample) &&
    a.isBrushStrokeActive === b.isBrushStrokeActive &&
    a.ignoreNextBrushClick === b.ignoreNextBrushClick);

/**
 * Preserves the previous state's identity when a gesture produced a
 * value-identical state, so React state updates can bail out instead of
 * re-rendering the whole canvas on every pointer event.
 */
export const stabilizeWallInteractionState = (
  previous: WallInteractionState,
  next: WallInteractionState,
): WallInteractionState =>
  areWallInteractionStatesEqual(previous, next) ? previous : next;

export const createWallInteractionState = (): WallInteractionState => ({
  drawAnchor: null,
  pointerPreview: null,
  hoverSnapPoint: null,
  pointerPosition: null,
  pointerSnapPoint: null,
  lastWallStartPoint: null,
  drawMessage: null,
  erasePreviewKeys: [],
  eraseStrokeLastSample: null,
  isEraseStrokeActive: false,
  ignoreNextEraseClick: false,
  brushStrokeLastSample: null,
  isBrushStrokeActive: false,
  ignoreNextBrushClick: false,
});

export const resetWallInteractionState = (): WallInteractionState =>
  createWallInteractionState();

export const releaseWallPointer = (
  state: WallInteractionState,
  context: WallInteractionContext,
): WallInteractionState => {
  if (
    context.activeDrawTool !== "wall-erase" &&
    context.activeDrawTool !== "wall-brush"
  ) {
    return state;
  }

  return stabilizeWallInteractionState(state, {
    ...state,
    eraseStrokeLastSample: null,
    isEraseStrokeActive: false,
    brushStrokeLastSample: null,
    isBrushStrokeActive: false,
  });
};

export const cancelWallTool = (
  adapter: Pick<WallInteractionAdapter, "setActiveDrawTool">,
): WallInteractionState => {
  adapter.setActiveDrawTool("device");
  return resetWallInteractionState();
};

export const suppressWallContextMenu = (
  state: WallInteractionState,
  context: WallInteractionContext,
): WallInteractionResult => {
  if (!context.isEditMode || context.activeDrawTool === "device") {
    return { state, handled: false };
  }

  return { state, handled: true };
};
