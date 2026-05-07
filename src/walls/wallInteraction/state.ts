import type {
  WallInteractionAdapter,
  WallInteractionContext,
  WallInteractionResult,
  WallInteractionState,
} from "./types";

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

  return {
    ...state,
    eraseStrokeLastSample: null,
    isEraseStrokeActive: false,
    brushStrokeLastSample: null,
    isBrushStrokeActive: false,
  };
};

export const cancelWallTool = (
  adapter: Pick<WallInteractionAdapter, "setActiveDrawTool">,
): WallInteractionState => {
  adapter.setActiveDrawTool("device");
  return resetWallInteractionState();
};

export const contextCancelWallInteraction = (
  state: WallInteractionState,
  context: WallInteractionContext,
  adapter: Pick<WallInteractionAdapter, "setActiveDrawTool">,
): WallInteractionResult => {
  if (!context.isEditMode || context.activeDrawTool === "device") {
    return { state, handled: false };
  }

  return { state: cancelWallTool(adapter), handled: true };
};
