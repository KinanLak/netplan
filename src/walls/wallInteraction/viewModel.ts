import type {
  DrawTool,
  FloorId,
  Position,
  WallColor,
  WallDraft,
} from "@/types/map";
import { arePositionsEqual } from "@/walls/gridGeometry/cells";
import {
  createOrthogonalWallDraft,
  createRoomWallDrafts,
  splitWallDraftIntoBlocks,
  splitWallDraftsIntoBlocks,
} from "@/walls/gridGeometry/drafts";
import type {
  WallInteractionContext,
  WallInteractionState,
  WallInteractionViewModel,
} from "./types";

export const getWallInteractionViewModel = (
  state: WallInteractionState,
  context: WallInteractionContext,
): WallInteractionViewModel => ({
  drawAnchor: state.drawAnchor,
  hoverSnapPoint: state.hoverSnapPoint,
  pointerPosition: context.trackPointerPosition ? state.pointerPosition : null,
  pointerSnapPoint: context.trackPointerPosition
    ? state.pointerSnapPoint
    : null,
  lastWallStartPoint: state.lastWallStartPoint,
  drawMessage: state.drawMessage,
  previewSegments: computePreviewSegments(
    state.drawAnchor,
    state.pointerPreview,
    context.currentFloorId,
    context.activeDrawTool,
    context.selectedWallColor,
  ),
  erasePreviewKeys: state.erasePreviewKeys,
  paneCursorClass: computePaneCursorClass(
    context.isEditMode,
    context.activeDrawTool,
    state.drawAnchor,
    state.pointerPreview,
  ),
});

const computePreviewSegments = (
  drawAnchor: Position | null,
  pointerPreview: Position | null,
  currentFloorId: FloorId | null,
  activeDrawTool: DrawTool,
  selectedWallColor: WallColor,
): Array<WallDraft> => {
  if (
    !drawAnchor ||
    !pointerPreview ||
    !currentFloorId ||
    activeDrawTool === "device" ||
    activeDrawTool === "wall-brush" ||
    activeDrawTool === "wall-erase"
  ) {
    return [];
  }

  if (activeDrawTool === "wall") {
    const segment = createOrthogonalWallDraft(
      drawAnchor,
      pointerPreview,
      currentFloorId,
      selectedWallColor,
    );

    return segment ? splitWallDraftIntoBlocks(segment) : [];
  }

  const roomDrafts = createRoomWallDrafts(
    drawAnchor,
    pointerPreview,
    currentFloorId,
    selectedWallColor,
  );

  return splitWallDraftsIntoBlocks(roomDrafts);
};

const computePaneCursorClass = (
  isEditMode: boolean,
  activeDrawTool: DrawTool,
  drawAnchor: Position | null,
  pointerPreview: Position | null,
): string => {
  if (!isEditMode || activeDrawTool === "device") {
    return "canvas-cursor-default";
  }

  if (
    activeDrawTool === "room" ||
    activeDrawTool === "wall-brush" ||
    activeDrawTool === "wall-erase"
  ) {
    return "wall-cursor-crosshair";
  }

  if (!drawAnchor || !pointerPreview) {
    return "wall-cursor-crosshair";
  }

  if (arePositionsEqual(pointerPreview, drawAnchor)) {
    return "wall-cursor-crosshair";
  }

  const dx = pointerPreview.x - drawAnchor.x;
  const dy = pointerPreview.y - drawAnchor.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "wall-cursor-e" : "wall-cursor-w";
  }

  return dy >= 0 ? "wall-cursor-s" : "wall-cursor-n";
};
